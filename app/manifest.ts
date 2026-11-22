import type { MetadataRoute } from "next";

// Cho phép "Thêm vào màn hình chính" trên điện thoại (PWA) cho chủ trọ.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quản lý phòng trọ",
    short_name: "Phòng trọ",
    description: "Quản lý tiền phòng, điện, nước hàng tháng",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#f4f3ee",
    theme_color: "#0b6b5f",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
