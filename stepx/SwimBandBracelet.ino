/*
 * SwimBand v1 — XIAO nRF52840 / nRF52840 Sense
 * Core: Seeed nRF52 mbed-enabled Boards. Library: ArduinoBLE.
 * Manual timer: no IMU required. Upload over USB using Arduino IDE.
 * Protocol: WI/R/F:RRRRRRRR:MMMMMMMM, exactly 20 ASCII bytes.
 * Commands: G:RRRRRRRR (start), F:RRRRRRRR (finish).
 * R = client run ID, M = elapsed milliseconds, hexadecimal.
 */
#include <ArduinoBLE.h>
#include <stdint.h>
#include <stdio.h>

BLEService swimService("12345678-1234-5678-1234-56789abcdef0");
BLEStringCharacteristic telemetry("12345678-1234-5678-1234-56789abcdef1", BLERead | BLENotify, 20);
BLEStringCharacteristic command("12345678-1234-5678-1234-56789abcdef2", BLEWrite, 20);

const uint32_t MAX_MS = 86400000UL; // 24 hours, hard cap.
char timerState = 'I';
uint32_t runId = 0;
uint32_t startedAt = 0;
uint32_t finishedMs = 0;
uint32_t lastPublish = 0;
bool previousConnection = false;

uint32_t elapsedNow() {
  if (timerState == 'I') return 0;
  if (timerState == 'F') return finishedMs;
  const uint32_t elapsed = (uint32_t)((uint32_t)millis() - startedAt);
  if (elapsed >= MAX_MS) {
    finishedMs = MAX_MS;
    timerState = 'F';
    return finishedMs;
  }
  return elapsed;
}
void publishState() {
  const uint32_t elapsed = elapsedNow();
  char value[21];
  snprintf(value, sizeof(value), "W%c:%08lX:%08lX", timerState,
           (unsigned long)runId, (unsigned long)elapsed);
  telemetry.writeValue(value);
  lastPublish = (uint32_t)millis();
}
bool parseRun(const String &text, uint32_t &result) {
  if (text.length() != 10 || text[1] != ':') return false;
  result = 0;
  for (uint8_t i = 2; i < 10; ++i) {
    const char c = text[i];
    uint8_t nibble;
    if (c >= '0' && c <= '9') nibble = c - '0';
    else if (c >= 'A' && c <= 'F') nibble = c - 'A' + 10;
    else if (c >= 'a' && c <= 'f') nibble = c - 'a' + 10;
    else return false;
    result = (result << 4) | nibble;
  }
  return result != 0;
}
void handleCommand() {
  const String text = command.value();
  uint32_t requestedRun;
  if (!parseRun(text, requestedRun) || (text[0] != 'G' && text[0] != 'F')) {
    telemetry.writeValue("E:COMMAND");
    return;
  }
  elapsedNow(); // Apply the time limit before handling a new command.
  if (text[0] == 'G') {
    // Duplicate starts never reset an existing run or its final result.
    if (requestedRun == runId && timerState != 'I') {
      publishState();
      return;
    }
    if (timerState == 'R') {
      telemetry.writeValue("E:BUSY");
      return;
    }
    runId = requestedRun;
    startedAt = (uint32_t)millis();
    finishedMs = 0;
    timerState = 'R';
    publishState();
    Serial.println("START");
  } else {
    if (requestedRun != runId || timerState == 'I') {
      telemetry.writeValue("E:RUN");
      return;
    }
    if (timerState == 'R') {
      finishedMs = elapsedNow();
      timerState = 'F';
      Serial.println("FINISH");
    }
    // Duplicate finishes return the original result.
    publishState();
  }
}
void setup() {
  Serial.begin(115200); // Do not wait for Serial: battery operation must work.
  if (!BLE.begin()) {
    Serial.println("BLE ERROR: check board core and ArduinoBLE library.");
    while (true) { delay(100); }
  }
  BLE.setLocalName("XIAO SwimBand");
  BLE.setDeviceName("XIAO SwimBand");
  BLE.setAdvertisedService(swimService);
  swimService.addCharacteristic(telemetry);
  swimService.addCharacteristic(command);
  BLE.addService(swimService);
  publishState();
  BLE.advertise();
  Serial.println("SwimBand ready. Connect from the website.");
}
void loop() {
  BLE.poll();
  const bool connected = BLE.connected();
  if (previousConnection && !connected) BLE.advertise();
  previousConnection = connected;
  if (command.written()) handleCommand();
  elapsedNow();
  const uint32_t interval = timerState == 'R' ? 250UL : 1000UL;
  if ((uint32_t)((uint32_t)millis() - lastPublish) >= interval) publishState();
}
