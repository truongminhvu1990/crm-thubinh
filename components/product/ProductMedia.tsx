"use client";

import { Video as VideoIcon } from "lucide-react";
import { Product } from "@/types/product";
import Card from "@/components/ui/Card";

interface Props {
  product: Product;
}

function getYoutubeEmbedUrl(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

function getDriveEmbedUrl(url: string): string | null {
  const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null;
}

export default function ProductMedia({ product }: Props) {
  if (!product.video) return null;

  const embedUrl = getYoutubeEmbedUrl(product.video) || getDriveEmbedUrl(product.video);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <VideoIcon className="w-5 h-5" />
        Video
      </h2>

      {embedUrl ? (
        <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted">
          <iframe
            src={embedUrl}
            title="Video sản phẩm"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      ) : (
        <a
          href={product.video}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <VideoIcon className="w-4 h-4" />
          Xem video sản phẩm
        </a>
      )}
    </Card>
  );
}
