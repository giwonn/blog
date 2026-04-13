import { Container } from "@/components/ui/Container";

export default function AboutPage() {
    return (
        <Container className="py-10">
            <h1 className="mb-8 text-3xl font-bold">About Me</h1>
            <div className="prose lg:prose-xl">
                <p>
                    Hello! I am Giwon. This is my blog built with Next.js and Tailwind CSS.
                </p>
                <p>
                    I am a software engineer passionate about web technologies.
                </p>
            </div>
        </Container>
    );
}
