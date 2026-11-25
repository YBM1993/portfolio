/*
 SwimBand v2 EXPERIMENTAL — automatic IMU turn candidates, manual start/finish.
 Board: XIAO nRF52840 Sense, Seeed nRF52 mbed-enabled Boards.
 Libraries: ArduinoBLE, Seeed Arduino LSM6DS3.
 Stand still for 3 seconds at boot. Wrist default. Pool validation required.
 Standalone sketch: the detector below is embedded; no extra .h needed.
*/
#include <ArduinoBLE.h>
#include <Wire.h>
#include <LSM6DS3.h>
#include <stdint.h>
#include <stdio.h>
#include <math.h>
#include <stdint.h>
#include <math.h>

// Experimental feature gate, not a validated swimming classifier.
// Requires rotation -> acceleration peak -> sustained quiet glide.
// Inputs: acceleration in g, gyro in deg/s with stationary bias removed.
class TurnDetector {
public:
  void begin(uint32_t now, uint8_t minimumSeconds, bool wrist) {
    minMs_ = (uint32_t)minimumSeconds * 1000UL;
    wrist_ = wrist;
    lastAccepted_ = now;
    clearCandidate();
    lastSample_ = now;
  }
  void gap(uint32_t now) { clearCandidate(); lastSample_ = now; }
  bool update(float ax,float ay,float az,float gx,float gy,float gz,uint32_t now) {
    const uint32_t step = (uint32_t)(now-lastSample_);
    lastSample_=now;
    if(step<1 || step>60 || !isfinite(ax+ay+az+gx+gy+gz)) {
      clearCandidate(); return false;
    }
    const float a=sqrtf(ax*ax+ay*ay+az*az);
    const float w=sqrtf(gx*gx+gy*gy+gz*gz);
    if(a<0.1f || a>3.9f || w>850.0f) { clearCandidate(); return false; }
    if((uint32_t)(now-lastAccepted_)<minMs_) { clearCandidate(); return false; }
    const float trigger=wrist_?130.0f:75.0f;
    const float quiet=wrist_?45.0f:32.0f;
    if(stage_==0) {
      if(w<trigger) return false;
      stage_=1;candidateAt_=now;q_[0]=1;q_[1]=q_[2]=q_[3]=0;
      path_=0;peakA_=a;quietAt_=0;
    }
    if((uint32_t)(now-candidateAt_)>4000UL) {clearCandidate();return false;}
    if(a>peakA_)peakA_=a;
    if(stage_==1) {
      const float dt=step*.001f, k=.00872664626f*dt; // deg/s -> half radians.
      const float x=gx*k,y=gy*k,z=gz*k;
      const float a0=q_[0],a1=q_[1],a2=q_[2],a3=q_[3];
      q_[0]=a0-a1*x-a2*y-a3*z;
      q_[1]=a1+a0*x+a2*z-a3*y;
      q_[2]=a2+a0*y+a3*x-a1*z;
      q_[3]=a3+a0*z+a1*y-a2*x;
      float norm=sqrtf(q_[0]*q_[0]+q_[1]*q_[1]+q_[2]*q_[2]+q_[3]*q_[3]);
      if(norm<.01f){clearCandidate();return false;}
      for(uint8_t i=0;i<4;i++)q_[i]/=norm;
      path_+=w*dt;
      if(w<quiet) {if(!quietAt_)quietAt_=now;} else quietAt_=0;
      if(quietAt_ && (uint32_t)(now-quietAt_)>=120UL) {
        const float scalar=fminf(1.0f,fabsf(q_[0]));
        const float angle=114.591559f*acosf(scalar);
        // Net rotation rejects oscillation and complete 360-degree arm cycles.
        if(angle<(wrist_?105.0f:95.0f) || path_>600.0f || angle/fmaxf(path_,1.0f)<.35f) {
          clearCandidate();return false;
        }
        stage_=2;rotationAt_=now;quietAt_=0;
        if(peakA_>=1.25f){stage_=3;pushAt_=now;}
      }
    } else if(stage_==2) {
      if(a>=1.25f){stage_=3;pushAt_=now;quietAt_=0;}
      else if((uint32_t)(now-rotationAt_)>900UL)clearCandidate();
    } else if(stage_==3) {
      if((uint32_t)(now-pushAt_)>1800UL){clearCandidate();return false;}
      if(w<quiet && a>.82f && a<1.18f) {
        if(!quietAt_)quietAt_=now;
        if((uint32_t)(now-quietAt_)>=(wrist_?650UL:500UL)) {
          lastAccepted_=now;clearCandidate();return true;
        }
      } else quietAt_=0;
    }
    return false;
  }
private:
  void clearCandidate(){stage_=0;quietAt_=0;}
  bool wrist_=true;
  uint8_t stage_=0;
  uint32_t minMs_=8000,lastAccepted_=0,lastSample_=0,candidateAt_=0;
  uint32_t quietAt_=0,rotationAt_=0,pushAt_=0;
  float q_[4]={1,0,0,0},path_=0,peakA_=0;
};

#if defined(TARGET_SEEED_XIAO_NRF52840_SENSE) || defined(TARGET_SEEED_XIAO_NRF52840_SENSE_PLUS)
#define SENSOR_WIRE Wire1
#else
#define SENSOR_WIRE Wire
#endif

LSM6DS3 imu(I2C_MODE, 0x6A);
BLEService swimService("12345678-1234-5678-1234-56789abcdef0");
BLEStringCharacteristic telemetry("12345678-1234-5678-1234-56789abcdef1", BLERead | BLENotify, 20);
BLEStringCharacteristic command("12345678-1234-5678-1234-56789abcdef2", BLEWrite, 20);
BLEStringCharacteristic stats("12345678-1234-5678-1234-56789abcdef3", BLERead | BLENotify, 20);
TurnDetector detector;
const uint32_t MAX_MS=86400000UL;
char timerState='I',sensorHealth='E';
uint32_t runId=0,startedAt=0,finishedMs=0,lastPublish=0,lastBoundary=0;
uint32_t lastRead=0,lastAttempt=0,calAt=0;
uint16_t turns=0,calCount=0;
uint8_t pool=25,minSeconds=8;
bool wrist=true,finalLength=false,imuReady=false,previousConnection=false;
float gyroBias[3]={0,0,0},calSum[3]={0,0,0},calSumSq[3]={0,0,0};

bool readRegisters(uint8_t reg,uint8_t *data,uint8_t length) {
  SENSOR_WIRE.beginTransmission(0x6A);SENSOR_WIRE.write(reg);
  if(SENSOR_WIRE.endTransmission(false)!=0)return false;
  if(SENSOR_WIRE.requestFrom((uint8_t)0x6A,length)!=length) {
    while(SENSOR_WIRE.available())SENSOR_WIRE.read();return false;
  }
  for(uint8_t i=0;i<length;i++) {if(!SENSOR_WIRE.available())return false;data[i]=SENSOR_WIRE.read();}
  return true;
}
int16_t signedWord(const uint8_t *p) {return (int16_t)((uint16_t)p[0]|((uint16_t)p[1]<<8));}
void resetCalibration(uint32_t now) {
  calCount=0;calAt=now;
  for(uint8_t i=0;i<3;i++){calSum[i]=0;calSumSq[i]=0;}
}
bool initializeSensor() {
  imu.settings.gyroEnabled=1;imu.settings.gyroRange=2000;imu.settings.gyroSampleRate=104;
  imu.settings.accelEnabled=1;imu.settings.accelRange=4;imu.settings.accelSampleRate=104;
  imu.settings.tempEnabled=0;
  if(imu.begin()!=IMU_SUCCESS)return false;
  uint8_t value=0,who=0;
  if(!readRegisters(0x0F,&who,1)||(who!=0x69&&who!=0x6A))return false;
  if(!readRegisters(0x12,&value,1)||imu.writeRegister(0x12,value|0x44)!=IMU_SUCCESS)return false;
  lastRead=(uint32_t)millis();resetCalibration(lastRead);sensorHealth='C';
  return true;
}
uint32_t elapsedNow() {
  if(timerState=='I')return 0;
  if(timerState=='F')return finishedMs;
  const uint32_t elapsed=(uint32_t)((uint32_t)millis()-startedAt);
  if(elapsed>=MAX_MS){finishedMs=MAX_MS;timerState='F';finalLength=false;return finishedMs;}
  return elapsed;
}
void publishState() {
  const uint32_t elapsed=elapsedNow();
  char value[21];
  const uint8_t flags=pool|(wrist?128:0)|(finalLength?64:0);
  snprintf(value,sizeof(value),"L%c%c:%08lX:%04X:%02X",timerState,sensorHealth,
    (unsigned long)runId,(unsigned int)turns,(unsigned int)flags);
  stats.writeValue(value);
  snprintf(value,sizeof(value),"W%c:%08lX:%08lX",timerState,(unsigned long)runId,(unsigned long)elapsed);
  telemetry.writeValue(value);lastPublish=(uint32_t)millis();
}
void sensorFault(uint32_t now) {
  imuReady=false;sensorHealth=timerState=='R'?'D':'E';
  resetCalibration(now);detector.gap(now);
}
void sampleSensor(uint32_t now) {
  if(!imuReady)return;
  uint8_t status=0;
  if(!readRegisters(0x1E,&status,1)){sensorFault(now);return;}
  if((status&3)!=3) {
    if((uint32_t)(now-lastRead)>200UL)sensorFault(now);
    return;
  }
  uint8_t raw[12];
  if(!readRegisters(0x22,raw,12)){sensorFault(now);return;}
  const uint32_t gap=(uint32_t)(now-lastRead);lastRead=now;
  float g[3],a[3];
  for(uint8_t i=0;i<3;i++){
    g[i]=signedWord(raw+2*i)*.07f;
    a[i]=signedWord(raw+6+2*i)*.000122f;
  }
  if(gap>60UL) {
    detector.gap(now);
    if(timerState=='R')sensorHealth='D';
    if(sensorHealth=='C')resetCalibration(now);
  }
  if(sensorHealth=='C') {
    const float mag=sqrtf(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);
    const float rotation=sqrtf(g[0]*g[0]+g[1]*g[1]+g[2]*g[2]);
    if(mag<.88f||mag>1.12f||rotation>12.0f){resetCalibration(now);return;}
    calCount++;
    for(uint8_t i=0;i<3;i++){calSum[i]+=g[i];calSumSq[i]+=g[i]*g[i];}
    if(calCount>=280 && (uint32_t)(now-calAt)>=2800UL) {
      bool stable=true;
      for(uint8_t i=0;i<3;i++){
        const float mean=calSum[i]/calCount;
        if(calSumSq[i]/calCount-mean*mean>1.5f)stable=false;
      }
      if(!stable){resetCalibration(now);return;}
      for(uint8_t i=0;i<3;i++)gyroBias[i]=calSum[i]/calCount;
      sensorHealth='O';Serial.println("IMU READY — calibrated");
      publishState();
    }
    return;
  }
  if(timerState!='R')return;
  if(detector.update(a[0],a[1],a[2],g[0]-gyroBias[0],g[1]-gyroBias[1],g[2]-gyroBias[2],now)) {
    if(turns<65535){turns++;lastBoundary=now;Serial.print("TURN,");Serial.print(now-startedAt);Serial.print(',');Serial.println(turns);}
    else sensorHealth='D';
    publishState();
  }
}
bool parseHex(const String &text,uint32_t &value) {
  value=0;if(text.length()==0||text.length()>8)return false;
  for(uint8_t i=0;i<text.length();i++){
    const char c=text[i];uint8_t digit;
    if(c>='0'&&c<='9')digit=c-'0';
    else if(c>='A'&&c<='F')digit=c-'A'+10;
    else if(c>='a'&&c<='f')digit=c-'a'+10;else return false;
    value=(value<<4)|digit;
  }return true;
}
void handleCommand() {
  const String text=command.value();
  if(text=="C"){
    if(timerState=='R'){telemetry.writeValue("E:BUSY");return;}
    // Explicit calibration clears the board's previous result, not browser history.
    timerState='I';runId=0;turns=0;finalLength=false;finishedMs=0;
    imuReady=initializeSensor();if(!imuReady)sensorHealth='E';publishState();return;
  }
  uint32_t requested;
  if(text.length()<10||text[1]!=':'||!parseHex(text.substring(2,10),requested)||requested==0){
    telemetry.writeValue("E:COMMAND");return;
  }
  elapsedNow();
  if(text[0]=='G'){
    uint32_t length,minimum;
    if(text.length()!=18||text[10]!=':'||text[13]!=':'||text[15]!=':'||
      !parseHex(text.substring(11,13),length)||!parseHex(text.substring(16,18),minimum)||
      (length!=25&&length!=50)||(text[14]!='W'&&text[14]!='B')||minimum<4||minimum>60){
      telemetry.writeValue("E:COMMAND");return;
    }
    if(requested==runId&&timerState!='I'){publishState();return;}
    if(timerState=='R'){telemetry.writeValue("E:BUSY");return;}
    if(!imuReady||sensorHealth!='O'){telemetry.writeValue("E:IMU");publishState();return;}
    pool=(uint8_t)length;minSeconds=(uint8_t)minimum;wrist=text[14]=='W';
    runId=requested;startedAt=(uint32_t)millis();lastBoundary=startedAt;
    finishedMs=0;turns=0;finalLength=false;timerState='R';
    detector.begin(startedAt,minSeconds,wrist);publishState();Serial.println("START");
  }else if(text[0]=='F'){
    if(text.length()!=13||text[10]!=':'||(text.substring(11)!="00"&&text.substring(11)!="01")){
      telemetry.writeValue("E:COMMAND");return;
    }
    if(requested!=runId||timerState=='I'){telemetry.writeValue("E:RUN");return;}
    if(timerState=='R'){
      finishedMs=elapsedNow();timerState='F';
      finalLength=text.substring(11)=="01"&&
        (uint32_t)((uint32_t)millis()-lastBoundary)>=(uint32_t)minSeconds*1000UL;
      Serial.println("FINISH");
    }
    publishState();
  }else telemetry.writeValue("E:COMMAND");
}
void setup() {
  Serial.begin(115200);
  if(!BLE.begin()){Serial.println("BLE ERROR");while(true)delay(100);}
  imuReady=initializeSensor();if(!imuReady)sensorHealth='E';
  BLE.setLocalName("XIAO SwimBand");BLE.setDeviceName("XIAO SwimBand");
  BLE.setAdvertisedService(swimService);
  swimService.addCharacteristic(telemetry);swimService.addCharacteristic(command);
  swimService.addCharacteristic(stats);BLE.addService(swimService);
  publishState();BLE.advertise();
  Serial.println(imuReady?"Hold still ~3 seconds for IMU calibration":"IMU ERROR: Sense sensor not found");
}
void loop() {
  BLE.poll();const uint32_t now=(uint32_t)millis();
  const bool connected=BLE.connected();
  if(previousConnection&&!connected)BLE.advertise();previousConnection=connected;
  if(command.written())handleCommand();
  if(!imuReady&&timerState=='I'&&(uint32_t)(now-lastAttempt)>=5000UL){
    lastAttempt=now;imuReady=initializeSensor();if(!imuReady)sensorHealth='E';
  }
  sampleSensor((uint32_t)millis());elapsedNow();
  const uint32_t interval=timerState=='R'?250UL:1000UL;
  if((uint32_t)((uint32_t)millis()-lastPublish)>=interval)publishState();
}
