/** Speech bubble with ornek.svg and the product name inside. Replace public/ornek.svg with your own artwork. */
export function Logo() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-3xl rounded-es-md bg-pc px-4 py-2.5 text-onpc">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ornek.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
      <span className="text-lg font-semibold tracking-tight">Q7 Message</span>
    </div>
  );
}
