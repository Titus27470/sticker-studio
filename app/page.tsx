import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-600 to-pink-500 text-white p-8">
      <h1 className="text-6xl font-bold mb-4">
         Sticker Studio
      </h1>
      <p className="text-xl mb-8 opacity-90">
        Create stickers, animations, and videos for social media
      </p>
      <Link
        href="/editor"
        className="bg-white text-purple-600 font-bold py-3 px-8 rounded-full hover:scale-105 transition"
      >
        Get Started
      </Link>
    </main>
  );
}