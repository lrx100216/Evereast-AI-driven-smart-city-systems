# Smart City - Arduino Hardware

## Required Components
- Arduino UNO
- HC-SR04 Ultrasonic Sensor (Traffic detection)
- DHT11 Temperature & Humidity Sensor (Weather)
- LDR Photoresistor (Light sensing for solar)
- Servo Motor SG90 (Solar panel tracking)
- LEDs: Red, Yellow, Green (Traffic signals)
- Breadboard, jumper wires, resistors

## Wiring Diagram

### Traffic Module
| Component | Arduino Pin |
|-----------|-------------|
| TRIG (Ultrasonic) | D9 |
| ECHO (Ultrasonic) | D10 |
| LED Red | D4 |
| LED Yellow | D5 |
| LED Green | D6 |

### Energy Module
| Component | Arduino Pin |
|-----------|-------------|
| LDR (via voltage divider) | A0 |
| Servo Motor | D11 |

### Weather Module
| Component | Arduino Pin |
|-----------|-------------|
| DHT11 Data | D7 |

## Communication Protocol

JSON lines over 9600 baud USB serial. The backend sends data to the frontend via Socket.IO.

```json
{"type":"traffic","carCount":5,"pedestrianCount":3,"congestionLevel":45,"averageSpeed":32,"timestamp":"..."}
{"type":"energy","solarVoltage":5.2,"batteryLevel":78,"panelAngle":45,"powerOutput":3.4,"consumption":1.2,"timestamp":"..."}
{"type":"weather","temperature":28,"humidity":65,"lightIntensity":800,"weatherCondition":"sunny","timestamp":"..."}
```

## Upload
Open `main/main.ino` in Arduino IDE, select board "Arduino UNO", set baud rate to 9600, and upload.

## Configuration
Set `SERIAL_PORT` in `backend/.env` (e.g., `COM3` on Windows, `/dev/ttyUSB0` on Linux). Leave empty to run in simulation mode.
