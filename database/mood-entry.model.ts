// src/database/models/mood-entry.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IMoodEntry extends Document {
  user: mongoose.Types.ObjectId; // Ref to User
  mood_score: number; // 1-10 scale
  mood_tags: string[]; // ['happy', 'stressed', 'excited', etc.]
  note?: string;
  activities: string[]; // activities user was doing
  weather?: string;
  sleep_hours?: number;
  energy_level: number; // 1-10
  social_interaction_level: number; // 1-10
  work_stress_level: number; // 1-10
  context_photo?: mongoose.Types.ObjectId; // Ref to File
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
    address?: string;
  };
  created_at: Date;
}

const MoodEntrySchema = new Schema<IMoodEntry>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mood_score: { type: Number, min: 1, max: 10, required: true },
  mood_tags: [{ type: String }],
  note: { type: String, maxlength: 500 },
  activities: [{ type: String }],
  weather: { type: String },
  sleep_hours: { type: Number, min: 0, max: 24 },
  energy_level: { type: Number, min: 1, max: 10, required: true },
  social_interaction_level: { type: Number, min: 1, max: 10, required: true },
  work_stress_level: { type: Number, min: 1, max: 10, required: true },
  context_photo: { type: Schema.Types.ObjectId, ref: 'File' },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      index: '2dsphere'
    },
    address: { type: String }
  },
  created_at: { type: Date, default: Date.now }
});

// Indexes
MoodEntrySchema.index({ user: 1, created_at: -1 });
MoodEntrySchema.index({ mood_score: 1 });
MoodEntrySchema.index({ user: 1, mood_score: 1, created_at: -1 });
MoodEntrySchema.index({ 'location.coordinates': '2dsphere' });

// Static methods
MoodEntrySchema.statics.getUserMoodTrends = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        created_at: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }
        },
        avg_mood: { $avg: '$mood_score' },
        avg_energy: { $avg: '$energy_level' },
        avg_social: { $avg: '$social_interaction_level' },
        avg_stress: { $avg: '$work_stress_level' },
        entries_count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);
};

MoodEntrySchema.statics.getMoodPatternsByActivity = function(userId: string, days: number = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        created_at: { $gte: startDate }
      }
    },
    {
      $unwind: '$activities'
    },
    {
      $group: {
        _id: '$activities',
        avg_mood: { $avg: '$mood_score' },
        avg_energy: { $avg: '$energy_level' },
        count: { $sum: 1 }
      }
    },
    {
      $match: { count: { $gte: 3 } } // Only include activities with at least 3 entries
    },
    {
      $sort: { avg_mood: -1 }
    }
  ]);
};

MoodEntrySchema.statics.getSleepMoodCorrelation = function(userId: string, days: number = 60) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        created_at: { $gte: startDate },
        sleep_hours: { $exists: true }
      }
    },
    {
      $group: {
        _id: {
          sleep_range: {
            $switch: {
              branches: [
                { case: { $lt: ['$sleep_hours', 6] }, then: 'less_than_6' },
                { case: { $lt: ['$sleep_hours', 8] }, then: '6_to_8' },
                { case: { $gte: ['$sleep_hours', 8] }, then: 'more_than_8' }
              ],
              default: 'unknown'
            }
          }
        },
        avg_mood: { $avg: '$mood_score' },
        avg_energy: { $avg: '$energy_level' },
        count: { $sum: 1 }
      }
    }
  ]);
};

MoodEntrySchema.statics.getWeeklyMoodSummary = function(userId: string) {
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        created_at: { $gte: startOfWeek }
      }
    },
    {
      $group: {
        _id: null,
        avg_mood: { $avg: '$mood_score' },
        avg_energy: { $avg: '$energy_level' },
        avg_social: { $avg: '$social_interaction_level' },
        avg_stress: { $avg: '$work_stress_level' },
        total_entries: { $sum: 1 },
        mood_tags: { $push: '$mood_tags' }
      }
    },
    {
      $addFields: {
        all_tags: {
          $reduce: {
            input: '$mood_tags',
            initialValue: [],
            in: { $concatArrays: ['$$value', '$$this'] }
          }
        }
      }
    }
  ]);
};

MoodEntrySchema.statics.createMoodEntry = async function(data: {
  userId: string;
  moodScore: number;
  moodTags?: string[];
  note?: string;
  activities?: string[];
  weather?: string;
  sleepHours?: number;
  energyLevel: number;
  socialInteractionLevel: number;
  workStressLevel: number;
  contextPhotoId?: string;
  location?: {
    coordinates: [number, number];
    address?: string;
  };
}) {
  const moodEntry = {
    user: data.userId,
    mood_score: data.moodScore,
    mood_tags: data.moodTags || [],
    note: data.note,
    activities: data.activities || [],
    weather: data.weather,
    sleep_hours: data.sleepHours,
    energy_level: data.energyLevel,
    social_interaction_level: data.socialInteractionLevel,
    work_stress_level: data.workStressLevel,
    context_photo: data.contextPhotoId,
    ...(data.location && {
      location: {
        type: 'Point',
        coordinates: data.location.coordinates,
        address: data.location.address
      }
    })
  };
  
  return this.create(moodEntry);
};

MoodEntrySchema.statics.getMoodInsights = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        created_at: { $gte: startDate }
      }
    },
    {
      $facet: {
        overall_stats: [
          {
            $group: {
              _id: null,
              avg_mood: { $avg: '$mood_score' },
              min_mood: { $min: '$mood_score' },
              max_mood: { $max: '$mood_score' },
              total_entries: { $sum: 1 }
            }
          }
        ],
        time_patterns: [
          {
            $group: {
              _id: { $hour: '$created_at' },
              avg_mood: { $avg: '$mood_score' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id': 1 } }
        ],
        best_activities: [
          { $unwind: '$activities' },
          {
            $group: {
              _id: '$activities',
              avg_mood: { $avg: '$mood_score' },
              count: { $sum: 1 }
            }
          },
          { $match: { count: { $gte: 2 } } },
          { $sort: { avg_mood: -1 } },
          { $limit: 5 }
        ]
      }
    }
  ]);
};

const MoodEntry = models.MoodEntry || model("MoodEntry", MoodEntrySchema);

export default MoodEntry;