#include <Wire.h>
#include <LSM6DS3.h>
#include <ArduinoBLE.h>
#include <cstdio>
#include <cmath>
#include <cmath>
#include <cstdint>

// A prototype gait detector, independent of Arduino for host-side tests.
// Input is acceleration magnitude in g, sampled about every 20 ms.
class StepDetector {
public:
    void reset() {
        initialized_ = false;
        samples_ = 0;
        streak_ = 0;
        armed_ = true;
    }

    uint8_t update(float magnitude, uint32_t now) {
        if (!std::isfinite(magnitude) || magnitude < 0.2f || magnitude > 6.0f) {
            reset();
            return 0;
        }
        if (!initialized_ || uint32_t(now - lastSample_) > 150) {
            smooth_ = baseline_ = magnitude;
            samples_ = 0;
            streak_ = 0;
            armed_ = true;
            initialized_ = true;
        }
        lastSample_ = now;
        smooth_ += 0.35f * (magnitude - smooth_);
        baseline_ += 0.02f * (smooth_ - baseline_);
        const float movement = smooth_ - baseline_;
        if (samples_ < 100) { ++samples_; return 0; } // settle for ~2 seconds
        if (movement < 0.025f) armed_ = true;
        if (!armed_ || movement < 0.12f) return 0;
        armed_ = false;
        const uint32_t elapsed = now - lastPeak_;
        if (streak_ > 0 && elapsed < 280) return 0;
        if (streak_ == 0 || elapsed > 1500) streak_ = 1;
        else if (streak_ < 4) ++streak_;
        lastPeak_ = now;
        // Confirm three consecutive peaks before including the first two.
        if (streak_ == 3) return 3;
        if (streak_ >= 4) return 1;
        return 0;
    }

private:
    bool initialized_ = false;
    bool armed_ = true;
    uint16_t samples_ = 0;
    uint8_t streak_ = 0;
    uint32_t lastSample_ = 0;
    uint32_t lastPeak_ = 0;
    float smooth_ = 1.0f;
    float baseline_ = 1.0f;
};

// Supported configuration: XIAO nRF52840 Sense + Seeed nRF52 mbed-enabled Boards.
// The library uses the internal Wire1 bus for these Sense board definitions.
#if defined(TARGET_SEEED_XIAO_NRF52840_SENSE) || defined(TARGET_SEEED_XIAO_NRF52840_SENSE_PLUS)
#define SENSOR_WIRE Wire1
#else
#define SENSOR_WIRE Wire
#endif

constexpr uint8_t IMU_ADDRESS = 0x6A;
LSM6DS3 imu(I2C_MODE, IMU_ADDRESS);
BLEService stepService("12345678-1234-5678-1234-56789abcdef0");
BLEStringCharacteristic telemetry("12345678-1234-5678-1234-56789abcdef1", BLERead | BLENotify, 20);
StepDetector detector;

uint32_t totalSteps = 0;
uint32_t bootSession = 0;
uint32_t lastSample = 0;
uint32_t lastPublish = 0;
uint32_t lastRetry = 0;
bool imuReady = false;
bool readHealthy = false;
bool previousConnection = false;

bool readRegisters(uint8_t reg, uint8_t* output, uint8_t length) {
    SENSOR_WIRE.beginTransmission(IMU_ADDRESS);
    SENSOR_WIRE.write(reg);
    if (SENSOR_WIRE.endTransmission(false) != 0) return false;
    // Unlike the library's float helpers, reject a partial I2C response explicitly.
    const size_t received = SENSOR_WIRE.requestFrom(IMU_ADDRESS, length);
    if (received != length) {
        while (SENSOR_WIRE.available()) SENSOR_WIRE.read();
        return false;
    }
    for (uint8_t i = 0; i < length; ++i) {
        if (!SENSOR_WIRE.available()) return false;
        output[i] = static_cast<uint8_t>(SENSOR_WIRE.read());
    }
    return true;
}

bool initializeIMU() {
    detector.reset();
    imu.settings.gyroEnabled = 0;
    imu.settings.tempEnabled = 0;
    imu.settings.accelRange = 4;
    imu.settings.accelSampleRate = 104;
    if (imu.begin() != IMU_SUCCESS) return false;
    uint8_t ctrl3 = 0;
    if (!readRegisters(0x12, &ctrl3, 1)) return false;
    // BDU + IF_INC: coherent words and auto-increment for the XYZ burst.
    if (imu.writeRegister(0x12, ctrl3 | 0x44) != IMU_SUCCESS) return false;
    return true;
}

bool accelerationMagnitude(float& magnitude) {
    uint8_t raw[6] = {};
    if (!readRegisters(0x28, raw, sizeof(raw))) return false;
    const int16_t x = static_cast<int16_t>(uint16_t(raw[0]) | (uint16_t(raw[1]) << 8));
    const int16_t y = static_cast<int16_t>(uint16_t(raw[2]) | (uint16_t(raw[3]) << 8));
    const int16_t z = static_cast<int16_t>(uint16_t(raw[4]) | (uint16_t(raw[5]) << 8));
    // LSM6DS3 sensitivity at +/-4 g: 0.122 mg/LSB.
    const float ax = x * 0.000122f;
    const float ay = y * 0.000122f;
    const float az = z * 0.000122f;
    magnitude = std::sqrt(ax * ax + ay * ay + az * az);
    return std::isfinite(magnitude) && magnitude >= 0.2f && magnitude <= 6.0f;
}

void publishSnapshot() {
    if (!imuReady) { telemetry.writeValue("E:IMU"); return; }
    if (!readHealthy) { telemetry.writeValue("E:READ"); return; }
    // Exactly 19 ASCII bytes, fits a notification even at MTU 23.
    char packet[20];
    std::snprintf(packet, sizeof(packet), "S:%08lX:%08lX",
                  static_cast<unsigned long>(bootSession), static_cast<unsigned long>(totalSteps));
    const int written = telemetry.writeValue(packet);
    if (telemetry.subscribed() && written != 19) Serial.println("BLE snapshot not fully sent; retry next second");
    Serial.println(packet);
}

void setup() {
    Serial.begin(115200); // Do not wait for USB: the bracelet must boot on battery.
    // Best-effort non-security boot token. Production hardware should use a
    // persistent boot counter or a verified hardware random-number source.
    uint32_t seed = micros();
    for (uint8_t i = 0; i < 32; ++i) {
        seed = (seed << 1) ^ uint32_t(analogRead(A0)) ^ micros();
        delayMicroseconds(37);
    }
    randomSeed(seed);
    bootSession = (uint32_t(random(0x10000L)) << 16) | uint32_t(random(0x10000L));

    if (!BLE.begin()) {
        Serial.println("Bluetooth ERROR! Check board package: mbed-enabled required.");
        while (true) delay(1000);
    }
    imuReady = initializeIMU();
    if (imuReady) {
        float magnitude;
        readHealthy = accelerationMagnitude(magnitude);
    }
    Serial.println(imuReady ? "IMU started!" : "IMU ERROR! Check Sense model and sensor address.");
    BLE.setLocalName("XIAO StepX");
    BLE.setAdvertisedService(stepService);
    stepService.addCharacteristic(telemetry);
    BLE.addService(stepService);
    publishSnapshot();
    BLE.advertise();
    Serial.println("Bluetooth advertising: XIAO StepX");
    lastSample = lastPublish = lastRetry = millis();
}

void loop() {
    BLE.poll();
    const uint32_t now = millis();
    const bool connected = BLE.connected();
    if (previousConnection && !connected) BLE.advertise();
    previousConnection = connected;

    if ((!imuReady || !readHealthy) && uint32_t(now - lastRetry) >= 5000) {
        lastRetry = now;
        imuReady = initializeIMU();
    }
    if (imuReady && uint32_t(now - lastSample) >= 20) {
        lastSample = now;
        float magnitude;
        readHealthy = accelerationMagnitude(magnitude);
        if (readHealthy) totalSteps += detector.update(magnitude, now);
        else detector.reset();
    }
    if (uint32_t(now - lastPublish) >= 1000) {
        lastPublish = now;
        // Update readable state while disconnected, notify when subscribed.
        publishSnapshot();
    }
}

