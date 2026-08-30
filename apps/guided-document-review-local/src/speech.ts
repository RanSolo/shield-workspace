export interface SpeechControls {
  readonly supported: boolean;
  read(text: string, onStatus: (message: string) => void): void;
  stop(onStatus: (message: string) => void): void;
}

export function createSpeechControls(): SpeechControls {
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  return {
    supported,
    read(text, onStatus) {
      if (!supported) {
        onStatus("Read aloud is not supported by this browser.");
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.onstart = () => onStatus("Reading aloud.");
      utterance.onend = () => onStatus("Finished reading.");
      utterance.onerror = () => onStatus("Reading stopped.");
      window.speechSynthesis.speak(utterance);
    },
    stop(onStatus) {
      if (supported) window.speechSynthesis.cancel();
      onStatus("Reading stopped.");
    },
  };
}
