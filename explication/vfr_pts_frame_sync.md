# VFR & PTS-Based Frame Synchronization

## Runtime Mode (auto CFR/VFR)

Le comportement de synchronisation est détecté automatiquement à l’upload :

- Le serveur extrait les PTS via ffprobe.
- Il compare les intervalles réels entre frames à `1/fps`.
- Si la variance est faible (CFR effectif) : `videos.pts_data = null`.
- Sinon (VFR) : `videos.pts_data` est stocké.

Le frontend appelle toujours `GET /api/videos/:id/pts` :
- VFR → renvoie les PTS
- CFR effectif → renvoie `{ ptsData: null }`

## The Problem: Variable Frame Rate (VFR) Videos

### What is VFR?

Most dashcam and action-camera videos are **VFR (Variable Frame Rate)**. Unlike studio-grade content where each frame is spaced exactly `1/fps` seconds apart (Constant Frame Rate / CFR), VFR videos have **irregular intervals** between frames. A camera advertised at "30 fps" might produce frames spaced anywhere from 1ms to 55ms apart instead of the expected 33.3ms.

This happens because real-world cameras:
- Adapt to lighting conditions (longer exposure = slower frame rate)
- Have imprecise internal clocks
- Drop frames under CPU/thermal pressure
- Prioritize visual quality over timing regularity

### Why it Matters for Bounding Box Alignment

An object detector (like the one producing `output.json`) numbers frames sequentially: frame 0, frame 1, frame 2, ... These numbers correspond to the **decode order** — the physical sequence of frames in the file.

The old player assumed CFR and computed video time as:
```
time = frameIndex / fps
```

For a VFR video, this is **wrong**. Frame 500 is not necessarily at `500 / 29.99 = 16.672s`. It might be at `16.690s` or `16.655s`. Even small errors (a few milliseconds) can make the browser display the **wrong frame**, so the bounding box drawn for frame 500 appears on the image of frame 499 or 501 — causing visible misalignment.

### Observed Symptoms

- Bounding boxes sometimes perfectly aligned, sometimes offset
- The misalignment pattern is **irregular** — not a steady drift but random streaks
- When navigating frame-by-frame, the image sometimes stays frozen but bounding boxes shift
- ~49% of frames were misaligned in our analysis of a real dashcam video

---

## The Solution: PTS (Presentation Time Stamps)

### What is PTS?

Every frame in a video file carries a **PTS (Presentation Time Stamp)** — the exact time (in seconds) when that frame should be displayed. This is embedded in the video container (MP4) by the camera at recording time.

For a VFR video:
```
Frame 0  → PTS: 0.0058s
Frame 1  → PTS: 0.0392s   (interval: 33.4ms)
Frame 2  → PTS: 0.0725s   (interval: 33.3ms)
Frame 3  → PTS: 0.1037s   (interval: 31.2ms)  ← irregular!
Frame 4  → PTS: 0.1392s   (interval: 35.5ms)  ← irregular!
...
```

The PTS is the **ground truth** for when each frame appears. The detector's `frame_number` maps directly to the PTS array index: frame 0 = PTS[0], frame 500 = PTS[500].

### How We Use PTS

#### At Upload Time
When a video is uploaded, the server runs `ffprobe` to extract the PTS of every frame and stores it as a JSON array (`ptsData`) in the `videos` table:

```
ptsData = [0.0058, 0.0392, 0.0725, 0.1037, 0.1392, ...]
```

This is a one-time extraction. The array has exactly as many entries as the video has frames.

#### Frame → Time (Seeking)

When the user navigates to frame N (e.g., clicks a bounding box), we look up:

```
seekTime = midpoint(ptsData[N], ptsData[N+1])
```

We seek to the **midpoint** between frame N's PTS and frame N+1's PTS. This is the VFR equivalent of the "+0.5 frame offset" trick used for CFR — it ensures the browser's decoder unambiguously shows frame N, not the adjacent frame.

#### Time → Frame (Display Sync)

During playback, the browser tells us the exact media time via `requestVideoFrameCallback`. We need to find which frame index corresponds to that time. We use a **binary search** in the PTS array:

```
Given time T, find the index i such that ptsData[i] is closest to T.
```

This is O(log n) and runs at every displayed frame (~30 times/second) without any performance concern.

#### Fallback for CFR Videos

If a video has no `ptsData` (older uploads, or genuinely CFR content), all functions fall back to the original CFR math (`frame / fps`, `Math.floor(time * fps + 0.001)`). The system is fully backward-compatible.

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────┐
│                     UPLOAD TIME                         │
│                                                         │
│  Video file  ──→  ffprobe extracts PTS per frame        │
│                   ──→  stored as ptsData[] in DB        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     RUNTIME                             │
│                                                         │
│  Frontend fetches ptsData via GET /api/videos/:id/pts   │
│                                                         │
│  ┌─── SEEKING (frame → time) ───────────────────────┐   │
│  │  User clicks frame 500                           │   │
│  │  → seekTime = (ptsData[500] + ptsData[501]) / 2  │   │
│  │  → video.currentTime = seekTime                  │   │
│  │  → Browser shows exact frame 500                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─── PLAYBACK SYNC (time → frame) ────────────────┐   │
│  │  requestVideoFrameCallback gives mediaTime       │   │
│  │  → binary search in ptsData                      │   │
│  │  → returns frameIndex                            │   │
│  │  → draw bounding boxes for that frameIndex       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Role |
|------|------|
| `server/video-utils.ts` | `extractPtsData()` — runs ffprobe, returns PTS array |
| `server/routes.ts` | Stores PTS at upload; serves via `GET /api/videos/:id/pts` |
| `shared/schema.ts` | `videos.ptsData` — JSONB column in the database |
| `client/src/pages/annotation-tool.tsx` | Fetches PTS data via `useQuery`, passes to VideoPlayer |
| `client/src/components/helpers/video-player-helpers.ts` | `calculateFrameFromTime()` (binary search), `calculateTimeFromFrame()` (PTS lookup), `ptsDataBinarySearch()` |
| `client/src/components/video-player.tsx` | All navigation functions use PTS-aware helpers |

---

## Important Notes

- **Existing videos** uploaded before this feature have `ptsData = null`. They fall back to CFR math. To fix them, re-upload or run a backfill script.
- The PTS array for a typical 25-minute / 22,000-frame video is ~200KB of JSON. Fetched once and cached by TanStack Query.
- `ptsData` length should match `totalFrames` from ffprobe. If it doesn't, something went wrong during extraction and the system falls back to CFR.
- The detector's `frame_number` (0-based sequential index) maps 1:1 to `ptsData` array indices — no transformation needed.
