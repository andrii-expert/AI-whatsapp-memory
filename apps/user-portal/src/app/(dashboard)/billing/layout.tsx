export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto px-0 py-0 md:px-4 md:py-8 max-w-7xl">
      {children}
    </div>
  );
}