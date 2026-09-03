import logoAsset from "@/assets/acrux-logo.png.asset.json";
import { cn } from "@/lib/utils";

/** Logo padrão da plataforma (Acrux). Usa a logo da equipe quando existir. */
export function BrandLogo({
  src,
  alt = "GE by Acrux ROBOCEP",
  className,
  imgClassName,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  const isCustom = Boolean(src);
  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center overflow-hidden shadow-lg shadow-acrux/40",
        isCustom ? "bg-card" : "bg-gradient-to-br from-acrux to-acrux-glow",
        className,
      )}
    >
      <img
        src={src || logoAsset.url}
        alt={alt}
        className={cn(isCustom ? "size-full object-cover" : "size-[72%] object-contain", imgClassName)}
        loading="lazy"
      />
    </div>
  );
}
