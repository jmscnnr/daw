import("stdfaust.lib");

low_freq = hslider("low_freq [unit:Hz]", 200, 20, 2000, 1);
low_gain = hslider("low_gain [unit:dB]", 0, -12, 12, 0.1);
mid_freq = hslider("mid_freq [unit:Hz]", 1000, 200, 8000, 1);
mid_gain = hslider("mid_gain [unit:dB]", 0, -12, 12, 0.1);
mid_q = hslider("mid_q", 1, 0.1, 10, 0.01);
high_freq = hslider("high_freq [unit:Hz]", 5000, 2000, 20000, 1);
high_gain = hslider("high_gain [unit:dB]", 0, -12, 12, 0.1);

process = fi.low_shelf(low_gain, low_freq)
        : fi.peak_eq(mid_gain, mid_freq, mid_freq / mid_q)
        : fi.high_shelf(high_gain, high_freq);
