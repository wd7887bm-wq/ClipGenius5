import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  try {
    const { jobId, filename } = await params;

    // Sanitize inputs
    if (
      jobId.includes("..") ||
      filename.includes("..") ||
      !filename.endsWith(".mp4")
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Try multiple locations (Vercel uses /tmp, local uses public/clips)
    const possiblePaths = [
      path.join("/tmp", "clips", jobId, filename),
      path.join(process.cwd(), "public", "clips", jobId, filename),
    ];

    let filePath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving clip:", error);
    return NextResponse.json(
      { error: "Failed to serve clip" },
      { status: 500 }
    );
  }
}
