// jsdom has no media playback; stub what the audio engine calls.
Object.assign(HTMLMediaElement.prototype, {
  play: () => Promise.resolve(),
  pause: () => {},
  load: () => {},
})
