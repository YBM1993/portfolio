# Checks
Host-side detector checks:
g++ -std=c++11 -O2 -Wall -Wextra turn_detector_test.cpp -o turn_detector_test
./turn_detector_test

The tests feed synthetic stationary, rotational, stroke-like, and missing-sample traces into
the exact C++ detector class embedded in SwimBandBracelet.ino.
These tests verify program behavior only. They do not establish sensitivity or specificity
in swimming and do not replace an Arduino board build or a pool comparison against video.
