import { HeroBanner } from "@/components/hero-banner";
import { SliderBanner } from "@/components/slider-banner";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface BannerCartaProps {
  empresa?: EmpresaPublic | null;
}

// Banner de la carta y, con el, su UNICO <h1>. El slider no pinta titulo (y
// sin imagenes no pinta nada), asi que el <h1> del modo slider va aqui, oculto
// para no alterar el diseno. Test: tests/ui/banner-carta.test.tsx.
export function BannerCarta({ empresa }: Readonly<BannerCartaProps>) {
  if (empresa?.tipoBanner === "slider") {
    return (
      <>
        <h1 className="sr-only">{empresa.nombre}</h1>
        <SliderBanner slides={empresa.bannerSlides} empresaNombre={empresa.nombre} />
      </>
    );
  }
  return <HeroBanner empresa={empresa} bannerFit={empresa?.bannerFit ?? "contain"} />;
}
