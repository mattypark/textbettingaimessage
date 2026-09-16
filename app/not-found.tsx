import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="slip max-w-sm px-8 py-10 text-center">
        <span className="stamp text-stamp">voided</span>
        <p className="font-display mt-4 text-3xl">No bet at this address.</p>
        <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-2">Back to the start</Link>
      </div>
    </main>
  );
}
