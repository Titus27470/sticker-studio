import Canvas from "../components/Canvas";

export default function EditorPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a
          href="/"
          className="text-purple-400 hover:text-purple-300 mb-6 inline-block text-sm"
        >
          ← Back to Home
        </a>
        <h1 className="text-3xl font-bold mb-1">Editor</h1>
        <p className="text-sm text-gray-500 mb-8">
          Create your sticker or post.
        </p>

        <Canvas />
      </div>
    </main>
  );
}