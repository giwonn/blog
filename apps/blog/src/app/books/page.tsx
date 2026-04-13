import { Container } from "@/components/ui/Container";
import { BookList } from "@/features/books/BookList";

export default function BooksPage() {
  return (
    <Container className="py-10">
      <BookList />
    </Container>
  );
}
