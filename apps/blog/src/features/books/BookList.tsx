import Link from "next/link";
import { getBookList } from "@/actions/books";

export async function BookList() {
  const books = await getBookList();

  return (
    <section>
      <h2 className="mb-8 text-3xl font-bold">독후감</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {books.map((book) => (
          <Link key={book.id} href={`/books/${book.slug}`} className="block">
            <article className="p-4 rounded-xl bg-white dark:bg-[#3a3a3a] border border-gray-300 dark:border-[#4a4a4a] shadow-md hover:shadow-xl hover:border-gray-400 dark:hover:border-[#5a5a5a] hover:-translate-y-1 transition-all duration-300">
              {book.thumbnailUrl && (
                <img src={book.thumbnailUrl} alt={book.title} className="w-full h-56 object-cover rounded-lg mb-4" />
              )}
              <h3 className="text-lg font-semibold mb-1 dark:text-white">{book.title}</h3>
              <p className="text-sm text-gray-600 dark:text-[#c0c0c0] mb-2">{book.author}</p>
              <div className="flex items-center justify-between text-sm text-gray-500 dark:text-[#a0a0a0]">
                {book.rating && <span>{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</span>}
                <span>{book.articleCount}개의 글</span>
              </div>
            </article>
          </Link>
        ))}
        {books.length === 0 && (
          <p className="text-gray-500 dark:text-[#a0a0a0]">독후감이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
