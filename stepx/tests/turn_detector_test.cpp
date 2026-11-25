#include "../turn-detector.h"
#include <assert.h>
#include <stdio.h>
#include <limits>
struct Trial {
  TurnDetector detector;
  uint32_t now;
  int count=0;
  Trial(uint32_t origin=0):now(origin){detector.begin(now,8,true);}
  void feed(int steps,float gyro=0,float accel=1) {
    for(int i=0;i<steps;i++){now+=10;if(detector.update(0,0,accel,0,gyro,0,now))count++;}
  }
  void turn(float accel=1.4f){feed(100,180,accel);feed(120);}
};
int main(){
  {Trial t;t.feed(2000);assert(t.count==0);}
  {Trial t;t.feed(800);t.turn();assert(t.count==1);t.turn();assert(t.count==1);t.feed(800);t.turn();assert(t.count==2);}
  {Trial t;t.feed(800);t.turn(1.0f);assert(t.count==0);}
  {Trial t;t.feed(800);for(int i=0;i<20;i++){t.feed(50,180,1.4f);t.feed(50,-180,1.4f);}t.feed(500);assert(t.count==0);}
  {Trial t;t.feed(800);t.feed(200,180,1.4f);t.feed(200);assert(t.count==0);}
  {Trial t;t.feed(800);t.feed(100,180,1.4f);t.feed(20);t.feed(150,180,1.4f);t.feed(300);assert(t.count==0);}
  {Trial t;t.feed(800);t.feed(100,180,1.4f);t.now+=1000;t.detector.gap(t.now);t.feed(200);assert(t.count==0);}
  {Trial t;t.feed(800);t.now+=10;t.detector.update(0,0,1,0,std::numeric_limits<float>::quiet_NaN(),0,t.now);t.feed(200);assert(t.count==0);}
  {Trial t(0xFFFFE000UL);t.feed(800);t.turn();assert(t.count==1);}
  puts("PASS: rest, turn, cooldown, no-push, strokes, 360-degree cycle, interrupted glide, data gap, invalid sample, millis rollover");
}
