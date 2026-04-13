import { Container } from "@/components/ui/Container";
import { SeriesList } from "@/features/series/SeriesList";

export default function SeriesPage() {
  return (
    <Container className="py-10">
      <SeriesList />
    </Container>
  );
}
