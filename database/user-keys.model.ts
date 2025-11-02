/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/userKeys.model.ts
import mongoose, { Document, model, models, Schema } from "mongoose";

export interface IUserKeys extends Document {
  user: mongoose.Types.ObjectId; // Ref to User
  identity_key: string; // Public Identity Key (JSON string)
  registration_id: number;
  pre_keys: {
    key_id: number;
    public_key: string; // JSON string of Uint8Array
    is_used: boolean;
    used_at?: Date;
  }[];
  signed_pre_key: {
    key_id: number;
    public_key: string; // JSON string
    signature: string; // JSON string
    created_at: Date;
  };
  previous_signed_pre_keys: {
    key_id: number;
    public_key: string;
    signature: string;
    created_at: Date;
    deprecated_at: Date;
  }[];
  created_at: Date;
  updated_at: Date;
}

const UserKeysSchema = new Schema<IUserKeys>({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    unique: true,
    index: true 
  },
  identity_key: { type: String, required: true },
  registration_id: { type: Number, required: true },
  pre_keys: [
    {
      key_id: { type: Number, required: true },
      public_key: { type: String, required: true },
      is_used: { type: Boolean, default: false },
      used_at: { type: Date },
    },
  ],
  signed_pre_key: {
    key_id: { type: Number, required: true },
    public_key: { type: String, required: true },
    signature: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  previous_signed_pre_keys: [
    {
      key_id: { type: Number, required: true },
      public_key: { type: String, required: true },
      signature: { type: String, required: true },
      created_at: { type: Date, required: true },
      deprecated_at: { type: Date, default: Date.now },
    },
  ],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Indexes
UserKeysSchema.index({ user: 1 });
UserKeysSchema.index({ "pre_keys.is_used": 1 });

// Pre-save middleware
UserKeysSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

// Static method: Get unused PreKey
UserKeysSchema.statics.getUnusedPreKey = async function (userId: string) {
  const userKeys = await this.findOne({ user: userId });
  if (!userKeys) return null;

  const unusedKey = userKeys.pre_keys.find((pk: { is_used: any; }) => !pk.is_used);
  return unusedKey;
};

// Static method: Mark PreKey as used
UserKeysSchema.statics.markPreKeyAsUsed = async function (
  userId: string,
  keyId: number
) {
  return this.updateOne(
    { user: userId, "pre_keys.key_id": keyId },
    {
      $set: {
        "pre_keys.$.is_used": true,
        "pre_keys.$.used_at": new Date(),
      },
    }
  );
};

// Static method: Count unused PreKeys
UserKeysSchema.statics.countUnusedPreKeys = async function (userId: string) {
  const userKeys = await this.findOne({ user: userId });
  if (!userKeys) return 0;
  return userKeys.pre_keys.filter((pk: { is_used: any; }) => !pk.is_used).length;
};

// Instance method: Refill PreKeys
UserKeysSchema.methods.refillPreKeys = function (
  newPreKeys: { key_id: number; public_key: string }[]
) {
  this.pre_keys.push(...newPreKeys.map((pk) => ({ ...pk, is_used: false })));
  return this.save();
};

// Instance method: Rotate Signed PreKey
UserKeysSchema.methods.rotateSignedPreKey = function (newSignedPreKey: {
  key_id: number;
  public_key: string;
  signature: string;
}) {
  // Move current signed pre key to previous
  this.previous_signed_pre_keys.push({
    ...this.signed_pre_key.toObject(),
    deprecated_at: new Date(),
  });

  // Set new signed pre key
  this.signed_pre_key = {
    ...newSignedPreKey,
    created_at: new Date(),
  };

  // Keep only last 3 previous signed pre keys
  if (this.previous_signed_pre_keys.length > 3) {
    this.previous_signed_pre_keys = this.previous_signed_pre_keys.slice(-3);
  }

  return this.save();
};

const UserKeys = models.UserKeys || model("UserKeys", UserKeysSchema);

export default UserKeys;