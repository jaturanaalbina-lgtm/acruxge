import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck } from "lucide-react";
import {
  fetchNotifications, markAllRead, markRead, notifyBrowserOnce, type AppNotification,
} from "@/lib/notifications";

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function NotificationBell() {
  const { activeOrgId } = useActiveOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const key = ["notifications", activeOrgId];
  const { data: items = [] } = useQuery({
    queryKey: key,
    enabled: !!activeOrgId,
    queryFn: () => fetchNotifications(activeOrgId!),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!activeOrgId) return;
    const ch = supabase
      .channel(`notifications:${activeOrgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeOrgId, qc]);

  useEffect(() => {
    const unread = items.filter((n) => !n.read_at);
    if (!unread.length) return;
    void (async () => { for (const n of unread.slice(0, 5)) await notifyBrowserOnce(n); })();
  }, [items]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const open = async (n: AppNotification) => {
    if (!n.read_at) {
      await markRead(n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) navigate({ to: n.link as never });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label="Avisos">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium">Avisos</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost" size="sm" className="h-7 text-xs"
              onClick={async () => {
                await markAllRead(activeOrgId!);
                qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              <CheckCheck className="size-3.5" /> Marcar tudo
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum aviso por enquanto.</div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void open(n)}
              className={`w-full text-left px-3 py-2 border-b border-border/60 hover:bg-muted/50 transition-colors ${
                n.read_at ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.read_at && <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
