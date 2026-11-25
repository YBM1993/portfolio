#pragma once
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
