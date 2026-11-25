/* 還沒搬過來的功能：說明會做什麼，並連回舊版對應的畫面（舊版照常可用）。 */
import { ExternalLink, Hammer } from "lucide-react";
import { Card } from "./ui";

export const OLD_APP = "https://johnlai900816-afk.github.io/special-exam-room-planner/";

export function Planned({ title, items, oldPath = "", oldLabel = "到舊版使用" }: { title: string; items: string[]; oldPath?: string; oldLabel?: string }) {
  return (
    <Card title={title} icon={<Hammer size={18} />}>
      <p className="mb-2 text-md text-ink2">這一步還在搬移中，先用舊版。新版會包含：</p>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-base text-ink">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <a href={OLD_APP + oldPath} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line2 bg-card px-3 text-md hover:bg-hover">
        <ExternalLink size={16} />
        {oldLabel}
      </a>
    </Card>
  );
}
