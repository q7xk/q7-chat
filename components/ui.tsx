import { cn } from "@/lib/cn";

export function Page({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-5 md:p-8">
      <header className="space-y-1.5"><h1 className="text-[32px] font-semibold leading-10 tracking-tight">{title}</h1>{intro && <p className="text-sm leading-relaxed text-muted">{intro}</p>}</header>
      {children}
    </div>
  );
}
export const Box = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn("rounded-[28px] p-5", !className?.includes("bg-") && "bg-container", className)}>{children}</div>;
