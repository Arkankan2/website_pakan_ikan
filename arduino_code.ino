/*
 * ===================================================================
 * SKETSA ARDUINO / ESP32: SISTEM PAKAN & MONITORING AIR KOLAM IKAN
 * Terhubung dengan Web Dashboard Laptop & Handphone
 * ===================================================================
 * 
 * Hardware yang didukung:
 * 1. Mikrokontroler : ESP32 atau ESP8266 NodeMCU
 * 2. Sensor Suhu    : DS18B20 Waterproof (Pin Data D4 / GPIO 4)
 * 3. Sensor Keruh   : Turbidity Sensor Analog Gravity (Pin A0 / GPIO 34)
 * 4. Dispenser Pakan: Motor Servo MG995 / SG90 (Pin PWM D2 / GPIO 13)
 * 
 * Library yang dibutuhkan di Arduino IDE:
 * - OneWire
 * - DallasTemperature
 * - ESP32Servo (jika pakai ESP32) atau Servo (jika ESP8266)
 * - WiFi & WebServer (bawaan board ESP)
 */

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  #include <Servo.h>
  ESP8266WebServer server(80);
#elif defined(ESP32)
  #include <WiFi.h>
  #include <WebServer.h>
  #include <ESP32Servo.h>
  WebServer server(80);
#endif

#include <OneWire.h>
#include <DallasTemperature.h>

// ===== 1. KONFIGURASI WIFI RUMAH / HOTSPOT HP =====
const char* ssid     = "NAMA_WIFI_ANDA";        // Ganti dengan SSID WiFi
const char* password = "PASSWORD_WIFI_ANDA";    // Ganti dengan Password WiFi

// ===== 2. KONFIGURASI PIN HARDWARE =====
#define PIN_SUHU_DS18B20  4   // Pin Data DS18B20 (Gunakan resistor pull-up 4.7k ke 3.3V)
#define PIN_TURBIDITY    34   // Pin Analog Sensor Kekeruhan Air (A0 di ESP8266 atau GPIO34 di ESP32)
#define PIN_SERVO_PAKAN  13   // Pin Kontrol Motor Servo Dispenser

OneWire oneWire(PIN_SUHU_DS18B20);
DallasTemperature sensorSuhu(&oneWire);
Servo servoPakan;

// Variabel status
float suhuAir = 28.5;
int kekeruhanNTU = 18;
int sisaPakanGram = 850;

// Kalibrasi putaran servo per gram pakan
// Misal 1 siklus buka-tutup (100ms) mengeluarkan rata-rata 5 gram pakan
const int GRAM_PER_CYCLE = 5; 

// ===================================================================
// FUNGSI BACA SENSOR
// ===================================================================
void updateSensors() {
  // 1. Baca Suhu Air (DS18B20)
  sensorSuhu.requestTemperatures();
  float t = sensorSuhu.getTempCByIndex(0);
  if (t != DEVICE_DISCONNECTED_C && t > 0) {
    suhuAir = t;
  }

  // 2. Baca Sensor Kekeruhan (Analog to Voltage to NTU)
  int sensorValue = analogRead(PIN_TURBIDITY);
  float voltage = sensorValue * (3.3 / 4095.0); // Sesuaikan jika pakai ESP8266 (3.3 / 1023.0)
  
  // Rumus estimasi konversi voltase ke NTU sederhana
  // Voltase tinggi (~3.0V ke atas) = Jernih (NTU rendah)
  // Voltase rendah (<2.5V) = Keruh (NTU tinggi)
  float ntu = -1120.4 * (voltage * voltage) + 5742.3 * voltage - 4353.8;
  if (ntu < 0) ntu = 0;
  if (ntu > 100) ntu = 100;
  kekeruhanNTU = (int)ntu;
}

// ===================================================================
// FUNGSI MOTOR DISPENSER PAKAN (SERVO)
// ===================================================================
void putarServoPakan(int gram) {
  int jumlahSiklus = gram / GRAM_PER_CYCLE;
  if (jumlahSiklus < 1) jumlahSiklus = 1;

  Serial.print("Mengeluarkan pakan sebanyak: ");
  Serial.print(gram);
  Serial.println(" gram...");

  for (int i = 0; i < jumlahSiklus; i++) {
    servoPakan.write(90);  // Katup corong pakan terbuka
    delay(200);            // Waktu pakan jatuh
    servoPakan.write(0);   // Katup corong pakan tertutup rapat
    delay(200);
  }

  // Kurangi estimasi pakan di tabung
  sisaPakanGram -= gram;
  if (sisaPakanGram < 0) sisaPakanGram = 0;
}

// ===================================================================
// API ENDPOINT HTTP DENGAN DUKUNGAN CORS (UNTUK BROWSER HP/LAPTOP)
// ===================================================================

// Endpoint GET: /data
// Mengembalikan JSON berisi suhu, kekeruhan, dan sisa pakan
void handleGetData() {
  updateSensors();

  String json = "{";
  json += "\"suhu\":" + String(suhuAir, 1) + ",";
  json += "\"kekeruhan\":" + String(kekeruhanNTU) + ",";
  json += "\"sisa_pakan\":" + String(sisaPakanGram);
  json += "}";

  // Berikan header CORS agar browser tidak memblokir koneksi
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// Endpoint GET: /feed?gram=25
// Menggerakkan servo dispenser pakan
void handleFeed() {
  int gram = 25; // default jika parameter kosong
  if (server.hasArg("gram")) {
    gram = server.arg("gram").toInt();
  }

  putarServoPakan(gram);

  String response = "{\"status\":\"ok\",\"dikeluarkan_gram\":" + String(gram) + "}";
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", response);
}

// ===================================================================
// SETUP & LOOP UTAMA
// ===================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Sistem Pakan & Monitoring Air Kolam Ikan ---");

  // Inisialisasi sensor suhu
  sensorSuhu.begin();

  // Inisialisasi pin servo
  servoPakan.attach(PIN_SERVO_PAKAN);
  servoPakan.write(0); // Posisi corong tertutup

  // Hubungkan ke WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.print(ssid);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Berhasil Terhubung!");
  Serial.print("Alamat IP Arduino Anda: http://");
  Serial.println(WiFi.localIP());
  Serial.println("-> Masukkan Alamat IP di atas pada Menu Pengaturan Alat di Website!");

  // Daftarkan route API
  server.on("/data", HTTP_GET, handleGetData);
  server.on("/feed", HTTP_GET, handleFeed);
  server.begin();
  Serial.println("Server Web Arduino Aktif!");
}

void loop() {
  server.handleClient();
}
