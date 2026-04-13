import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Header() {
    return (
        <header className="sticky top-0 z-40 bg-white dark:bg-[#303030] border-b py-4">
            <Container className="flex items-center justify-between">
                <Link href="/" className="text-xl font-bold">
                    Giwon's Blog
                </Link>
                <div className="flex items-center gap-4">
                    <nav className="flex gap-4">
                        <Link href="/articles" className="hover:underline">글</Link>
                        <Link href="/series" className="hover:underline">시리즈</Link>
                        <Link href="/books" className="hover:underline">독후감</Link>
                        <Link href="/about" className="hover:underline">소개</Link>
                    </nav>
                    <ThemeToggle />
                </div>
            </Container>
        </header>
    );
}
