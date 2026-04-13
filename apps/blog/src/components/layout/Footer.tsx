import { Container } from "@/components/ui/Container";

export function Footer() {
    return (
        <footer className="border-t py-8 text-center text-sm text-gray-500">
            <Container>
                &copy; {new Date().getFullYear()} Giwon. All rights reserved.
            </Container>
        </footer>
    );
}
