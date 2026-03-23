import("stdfaust.lib");

process = co.compressor_mono(ratio, threshold, attack, release)
with {
  ratio = hslider("ratio", 4, 1, 20, 0.1);
  threshold = hslider("threshold [unit:dB]", -20, -60, 0, 0.1);
  attack = hslider("attack [unit:ms]", 10, 1, 200, 1) / 1000;
  release = hslider("release [unit:ms]", 100, 10, 2000, 1) / 1000;
};
