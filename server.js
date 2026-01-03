// Simple Express server for image compression
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
require("dotenv").config();

const app = express();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const PORT = process.env.PORT || 4000;

// CORS so your Vercel app can call this API
app.use(
  cors({
    origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN,
    credentials: false
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, message: "Image compressor backend is running" });
});

// POST /api/images/compress
app.post("/api/images/compress", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const quality = Number(req.body.quality || 80);
    const safeQuality = Math.min(Math.max(quality, 40), 95);

    const format = (req.body.format || "jpeg").toLowerCase();
    const maxWidth = Number(req.body.maxWidth || 1920);

    let image = sharp(req.file.buffer);
    const metadata = await image.metadata();

    // Resize if too wide
    if (metadata.width && metadata.width > maxWidth) {
      image = image.resize({ width: maxWidth });
    }

    // Apply format + quality
    switch (format) {
      case "png":
        image = image.png({ quality: safeQuality });
        break;
      case "webp":
        image = image.webp({ quality: safeQuality });
        break;
      default:
        image = image.jpeg({ quality: safeQuality });
        break;
    }

    const compressedBuffer = await image.toBuffer();

    const originalSize = req.file.size;

    // If "compressed" is >5% bigger, keep original (already optimized)
    if (compressedBuffer.length > originalSize * 1.05) {
      res.setHeader("X-Compression-Note", "Original image kept (already optimized)");
      res.setHeader("Content-Type", req.file.mimetype || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="compressed-${path.basename(req.file.originalname)}"`
      );
      return res.send(req.file.buffer);
    }

    res.setHeader("Content-Type", `image/${format === "jpeg" ? "jpeg" : format}`);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="compressed-${path.basename(req.file.originalname)}"`
    );
    res.setHeader("X-Original-Size", String(originalSize));
    res.setHeader("X-Compressed-Size", String(compressedBuffer.length));

    return res.send(compressedBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Compression failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
