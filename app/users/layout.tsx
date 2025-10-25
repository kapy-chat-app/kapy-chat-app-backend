export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
    return(
        <div className="">
            {children}
        </div>
    )
}