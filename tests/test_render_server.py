import base64
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("APP_ACCESS_PIN", "ci-test-pin")

from fastapi.testclient import TestClient
import render_server.main as server


PNG_1PX = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j"
    "XioAAAAASUVORK5CYII="
)


class FakeSpeech:
    def __init__(self, text, voice, rate):
        self.text = text

    async def save(self, path):
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-c:a", "libmp3lame", "-q:a", "7", path,
            ],
            check=True,
            capture_output=True,
        )


class RenderServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(server.app)

    def test_access_pin_protects_health_endpoint(self):
        denied = self.client.get("/health")
        self.assertEqual(denied.status_code, 401)
        allowed = self.client.get("/health", headers={"X-App-Access-PIN": "ci-test-pin"})
        self.assertEqual(allowed.status_code, 200)
        self.assertTrue(allowed.json()["ok"])

    def test_language_detection(self):
        self.assertEqual(server.detect_story_language("یہ اردو کہانی ہے"), "ur-PK")
        self.assertEqual(server.detect_story_language("यह हिंदी कहानी है"), "hi-IN")
        self.assertEqual(server.detect_story_language("ਮੈਂ ਪੰਜਾਬੀ ਬੋਲਦਾ ਹਾਂ"), "pa-IN")
        self.assertEqual(server.detect_story_language("An English story"), "en-US")

    def test_video_filter_contains_motion_and_caption(self):
        result = server.build_viral_filter(720, 1280, "punch_zoom", "Test caption", "WAIT")
        self.assertIn("zoompan", result)
        self.assertIn("drawtext", result)
        self.assertIn("format=yuv420p", result)

    def test_merge_chapters_accepts_renderer_local_video_paths(self):
        if not server.shutil.which("ffmpeg"):
            self.skipTest("FFmpeg is not installed")
        chapter_ids = []
        for _ in range(2):
            job_id = __import__("uuid").uuid4().hex
            work = server.DATA_DIR / job_id
            work.mkdir(parents=True, exist_ok=True)
            target = work / "story-video.mp4"
            subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "color=c=blue:s=160x120:d=1:r=10",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    "-shortest", str(target),
                ],
                check=True,
                capture_output=True,
            )
            chapter_ids.append(job_id)
        response = self.client.post(
            "/api/merge-chapters",
            json={"chapter_urls": [f"/api/jobs/{job_id}/video" for job_id in chapter_ids]},
            headers={"X-App-Access-PIN": "ci-test-pin"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["video_url"].startswith("/api/jobs/"))

    @unittest.skipUnless(os.getenv("RUN_LIVE_RENDER_TEST") == "1", "live service integration is opt-in")
    def test_live_urdu_voice_and_generated_image_make_real_mp4(self):
        if not server.shutil.which("ffmpeg") or not server.shutil.which("ffprobe"):
            self.skipTest("FFmpeg/FFprobe are not installed")
        import urllib.parse
        prompt = urllib.parse.quote("cinematic story scene, a small village at sunset, no text")
        image_url = (
            "https://image.pollinations.ai/prompt/" + prompt
            + "?width=320&height=568&seed=20261118&nologo=true"
        )
        payload = {
            "aspect_ratio": "9:16",
            "scenes": [{
                "narration": "یہ ایک مختصر اردو آزمائشی کہانی ہے۔",
                "media_url": image_url,
                "is_video": False,
                "effect": "punch_zoom",
                "subtitle_chunk": "ایک مختصر آزمائشی منظر",
                "duration_sec": 2.5,
            }],
        }
        response = self.client.post(
            "/api/render-story",
            json=payload,
            headers={"X-App-Access-PIN": "ci-test-pin"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        video = self.client.get(
            result["video_url"],
            headers={"X-App-Access-PIN": "ci-test-pin"},
        )
        self.assertEqual(video.status_code, 200)
        self.assertEqual(video.headers.get("content-type"), "video/mp4")
        self.assertGreater(len(video.content), 10000)
        job_dir = server.DATA_DIR / result["job_id"]
        self.assertTrue((job_dir / "thumbnail.jpg").is_file())
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
             "-of", "csv=p=0", str(job_dir / "story-video.mp4")],
            check=True, capture_output=True, text=True,
        )
        self.assertIn("video", probe.stdout)
        self.assertIn("audio", probe.stdout)

    def test_local_media_render_produces_downloadable_mp4(self):
        if not server.shutil.which("ffmpeg") or not server.shutil.which("ffprobe"):
            self.skipTest("FFmpeg/FFprobe are not installed")
        payload = {
            "aspect_ratio": "9:16",
            "scenes": [{
                "narration": "A short test scene",
                "media_url": "data:image/png;base64," + PNG_1PX,
                "is_video": False,
                "effect": "punch_zoom",
                "subtitle_chunk": "Test scene",
                "duration_sec": 2.5,
            }],
        }
        with patch.object(server.edge_tts, "Communicate", FakeSpeech):
            response = self.client.post(
                "/api/render-story",
                json=payload,
                headers={"X-App-Access-PIN": "ci-test-pin"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertIn("video_url", result)
        video = self.client.get(
            result["video_url"],
            headers={"X-App-Access-PIN": "ci-test-pin"},
        )
        self.assertEqual(video.status_code, 200)
        self.assertEqual(video.headers.get("content-type"), "video/mp4")
        self.assertGreater(len(video.content), 10000)
        job_dir = server.DATA_DIR / result["job_id"]
        self.assertTrue((job_dir / "thumbnail.jpg").is_file())


if __name__ == "__main__":
    unittest.main()
