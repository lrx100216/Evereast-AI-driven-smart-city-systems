/*
 * Arduino 主控程序 —— 传感器数据采集 + 执行器控制
 * 
 * 硬件清单：
 *   - HC-SR04 超声波测距（估车流）
 *   - DHT11 温湿度
 *   - LDR 光敏电阻（估光照）
 *   - SG90 舵机（太阳能板角度）
 *   - LED x3（信号灯 demo）
 * 
 * 数据格式：JSON over Serial，9600 baud
 * 后端如果没检测到串口会自动切模拟模式，所以这个程序不是必须跑的
 * 
 * TODO: 超声波测距换算车流量的公式非常粗糙，就是近=车多，远=车少
 *       如果要准的话得上地磁或者摄像头
 */

#include <DHT.h>
#include <Servo.h>

// Pin Definitions
#define TRIG_PIN 9
#define ECHO_PIN 10
#define LED_RED 4
#define LED_YELLOW 5
#define LED_GREEN 6
#define LDR_PIN A0
#define SERVO_PIN 11
#define DHT_PIN 7
#define DHT_TYPE DHT11

// Objects
DHT dht(DHT_PIN, DHT_TYPE);
Servo solarServo;

// Timing
unsigned long lastSend = 0;
const unsigned long INTERVAL = 3000; // send data every 3s

void setup() {
  Serial.begin(9600);

  // Traffic module
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);

  // Energy module
  pinMode(LDR_PIN, INPUT);
  solarServo.attach(SERVO_PIN);
  solarServo.write(90); // center position

  // Weather module
  dht.begin();

  Serial.println("{\"type\":\"system\",\"status\":\"ready\"}");
}

void loop() {
  handleSerialCommands();

  if (millis() - lastSend >= INTERVAL) {
    sendTrafficData();
    sendEnergyData();
    sendWeatherData();
    lastSend = millis();
  }
}

// === Traffic Module ===
void sendTrafficData() {
  long duration, distance;

  // Send ultrasonic pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  duration = pulseIn(ECHO_PIN, HIGH, 30000); // timeout 30ms
  distance = duration * 0.034 / 2;

  // Simulate car count based on distance (closer = more traffic)
  int carCount = constrain(map(distance, 2, 100, 25, 2), 2, 25);
  int congestionLevel = constrain(map(carCount, 2, 25, 10, 95), 10, 95);

  Serial.print("{\"type\":\"traffic\",\"carCount\":");
  Serial.print(carCount);
  Serial.print(",\"pedestrianCount\":");
  Serial.print(random(1, 10));
  Serial.print(",\"congestionLevel\":");
  Serial.print(congestionLevel);
  Serial.print(",\"averageSpeed\":");
  Serial.print(random(15, 50));
  Serial.println("}");
}

// === Energy Module ===
void sendEnergyData() {
  int ldrValue = analogRead(LDR_PIN);
  float voltage = ldrValue * (5.0 / 1023.0);

  // Simulate solar panel: LDR value maps to solar voltage
  float solarVoltage = constrain(voltage * 1.5, 0.5, 5.0);
  int batteryLevel = constrain(map(ldrValue, 0, 1023, 20, 95), 20, 95);

  // Solar panel follows light (servo angle based on LDR)
  int panelAngle = constrain(map(ldrValue, 0, 1023, 0, 180), 0, 180);
  solarServo.write(panelAngle);

  Serial.print("{\"type\":\"energy\",\"solarVoltage\":");
  Serial.print(solarVoltage, 2);
  Serial.print(",\"batteryLevel\":");
  Serial.print(batteryLevel);
  Serial.print(",\"panelAngle\":");
  Serial.print(panelAngle);
  Serial.print(",\"powerOutput\":");
  Serial.print(solarVoltage * 0.8, 1);
  Serial.print(",\"consumption\":");
  Serial.print(random(10, 50) / 10.0, 1);
  Serial.println("}");
}

// === Weather Module ===
void sendWeatherData() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    return; // skip if sensor read fails
  }

  int ldrValue = analogRead(LDR_PIN);
  int lightIntensity = constrain(map(ldrValue, 0, 1023, 0, 1000), 0, 1000);

  const char* condition = "sunny";
  if (lightIntensity < 200) condition = "rainy";
  else if (lightIntensity < 500) condition = "cloudy";

  Serial.print("{\"type\":\"weather\",\"temperature\":");
  Serial.print(temperature, 1);
  Serial.print(",\"humidity\":");
  Serial.print(humidity, 0);
  Serial.print(",\"lightIntensity\":");
  Serial.print(lightIntensity);
  Serial.print(",\"weatherCondition\":\"");
  Serial.print(condition);
  Serial.println("\"}");
}

// === Command Handler ===
void handleSerialCommands() {
  if (Serial.available() <= 0) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd.startsWith("{\"type\":\"signal\"")) {
    // Parse signal command and update LEDs
    int greenDuration = extractInt(cmd, "\"greenDuration\":");
    int redDuration = extractInt(cmd, "\"redDuration\":");

    // Flash green then red as demo
    digitalWrite(LED_GREEN, HIGH);
    delay(greenDuration * 50);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, HIGH);
    delay(redDuration * 50);
    digitalWrite(LED_RED, LOW);

    Serial.println("{\"type\":\"system\",\"status\":\"signal_updated\"}");
  } else if (cmd.startsWith("{\"type\":\"panel\"")) {
    int angle = extractInt(cmd, "\"angle\":");
    angle = constrain(angle, 0, 180);
    solarServo.write(angle);
    Serial.println("{\"type\":\"system\",\"status\":\"panel_moved\"}");
  }
}

// Simple JSON integer extractor (no external library needed)
int extractInt(String data, String key) {
  int idx = data.indexOf(key);
  if (idx == -1) return 0;
  idx += key.length();
  String val = "";
  while (idx < (int)data.length() && data[idx] >= '0' && data[idx] <= '9') {
    val += data[idx++];
  }
  return val.toInt();
}
