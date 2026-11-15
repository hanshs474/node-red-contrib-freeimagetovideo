# node-red-contrib-freeimagetovideo

Free image to video AI with no daily cap: start with no sign-up, keep going on a free account. Every video comes with sound and no watermark. This is the Node-RED node for [Free Image to Video](https://freeimagetovideo.ai/?utm_source=nodered&utm_medium=package).

Send a prompt in `msg.payload` and get the finished MP4 URL (with sound, on MiniMax H3) back in `msg.payload`. Supports [free text to video AI](https://freeimagetovideo.ai/video/free-text-to-video-ai) and [image to video AI with sound](https://freeimagetovideo.ai/video/image-to-video-ai-with-sound) (pass `msg.image`).

## Install

```bash
npm install node-red-contrib-freeimagetovideo
```

## API key

Create a key at [freeimagetovideo.ai/settings/apikeys](https://freeimagetovideo.ai/settings/apikeys) and paste it into the node's **API Key** field or set `FREEIMAGETOVIDEO_API_KEY`. API runs draw on your plan's daily full-speed allowance, then wait in the relaxed queue ([pricing](https://freeimagetovideo.ai/pricing)).
