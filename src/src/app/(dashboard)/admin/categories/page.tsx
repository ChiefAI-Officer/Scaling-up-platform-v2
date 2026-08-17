import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import CategoriesClient from "./categories-client";

export default function CategoriesPage() {
  return <CategoriesClient responsiveEnabled={isMobileResponsiveEnabled()} />;
}
