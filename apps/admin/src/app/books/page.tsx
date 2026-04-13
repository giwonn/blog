"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBookList, deleteBook } from "@/actions/books";
import type { Book } from "@/types";

export default function BooksListPage() {
  const [bookList, setBookList] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await getBookList();
      setBookList(data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteBook(id);
      setBookList((prev) => prev.filter((b) => b.id !== id));
    } catch {
      alert("삭제에 실패했습니다.");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">불러오는 중...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">독후감 관리</h1>
        <Link
          href="/books/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          새 독후감
        </Link>
      </div>

      {bookList.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          등록된 독후감이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">제목</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">저자</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">평점</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">생성일</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {bookList.map((book) => (
                <tr key={book.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/books/${book.id}/edit`} className="text-blue-600 hover:underline">
                      {book.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{book.author}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {book.rating ? `${book.rating}/5` : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(book.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/books/${book.id}/edit`}
                        className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                      >
                        수정
                      </Link>
                      <button
                        onClick={() => handleDelete(book.id)}
                        className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
