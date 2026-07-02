/**
 * Plays a short, encouraging success chime sound using Web Audio API.
 * This does not rely on any external audio files and is completely offline-friendly.
 */
export function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const now = ctx.currentTime;
    
    // Play 3 ascending notes for a bright and clean major arpeggio: G5 -> C6 -> E6
    const notes = [
      { freq: 783.99, start: 0, duration: 0.15 },    // G5
      { freq: 1046.50, start: 0.08, duration: 0.15 }, // C6
      { freq: 1318.51, start: 0.16, duration: 0.45 }  // E6
    ];
    
    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      
      // Chime envelope: soft rapid attack, then smooth decay
      gainNode.gain.setValueAtTime(0, now + note.start);
      gainNode.gain.linearRampToValueAtTime(0.2, now + note.start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration);
    });
  } catch (e) {
    console.warn("Failed to play success chime via Web Audio:", e);
  }
}
