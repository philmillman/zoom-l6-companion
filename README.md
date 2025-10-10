# Zoom L6 Companion App

**This project is not affiliated with Zoom Corp.**

> This is under active development, contributions are welcome!

***You can try it out here: https://zooml6.webmidi.cc in a WebMIDI supported browser***


![full channel view](/images/channel-full.png)


A web-based companion application for the Zoom L6 mixer built with Vue.js and WebMIDI.js. This app allows you to control your Zoom L6 mixer directly from your browser using MIDI over USB. 

## Features

![compact channel view](/images/channel-compact.png)

- **6 Channel Strips** - Full control over each of the 4 channels including:
  - 3-band EQ (High, Mid with frequency control, Low)
  - Pan control
  - Aux sends (Aux1, Aux2)
  - Effects send (EFX)
  - Volume fader
  - Mute, Mono (ch 3/4), USB (ch 5/6) buttons

- **Global Controls** - Effects section:
  - EFX Type selector (Hall, Room, Spring, Delay, Echo)
  - Compressor on/off toggle

- **LFO (Low Frequency Oscillator) System** - Advanced modulation features:
  - Individual LFO control for each knob parameter
  - Multiple waveforms: Sine, Triangle, Square, Saw
  - Three modulation modes: Bipolar, Positive, Negative
  - Adjustable rate (0.1-10 Hz) and depth (0-100%)
  - Visual feedback with animated indicators
  - Global LFO disable controls

- **Sound Pads** - MIDI trigger pads:
  - 4 programmable MIDI note triggers
  - MIDI note on/off messages

- **MIDI Integration** - WebMIDI.js powered features:
  - Auto-detection of Zoom L6 device
  - Real-time bidirectional MIDI communication
  - Support for manual device selection
  - MIDI CC mapping based on Zoom L6 specification (coming soon to UI)
  - MIDI note triggers via Sound Pads (coming soon to UI)

- **Modern UI** - Responsive design features:
  - Dark theme
  - Compact and regular view modes
  - Mobile-optimized layout with smart label placement
  - Touch-friendly controls for tablets
  - Responsive layout for all screen sizes
  - Debug console for troubleshooting

## Requirements
- Modern web browser with WebMIDI support (Chrome, Edge, Firefox)
- Zoom L6 mixer connected via USB
- MIDI drivers installed (Windows)

## Setup Instructions

1. **Connect your Zoom L6**:
   - Connect the Zoom L6 to your computer via USB cable
   - Ensure the device is powered on

2. **Launch the app**:
   - Open the companion app in a compatible web browser
   - Click "Allow" when prompted for MIDI access

3. **Connect to device**:
   - Use the "Auto-Connect Zoom" button for automatic detection
   - Or manually select your Zoom L6 from the device dropdowns
   - The status indicator should show "Connected" when successful

4. **Start mixing**:
   - Use the channel strips to control individual channels
   - Adjust global effects and master controls
   - Enable LFOs on individual controls for modulation effects
   - Use Sound Pads to trigger MIDI notes
   - Changes are sent to the Zoom L6 in real-time

## MIDI CC Mapping

The app uses the following MIDI CC mappings (typical values - may need adjustment based on your device firmware):

### Channel Controls (per channel)
- Volume: CC7, 27, 47, 67 (channels 1-4)  
- Pan: CC10, 30, 50, 70 (channels 1-4)
- EQ High: CC11, 31, 51, 71 (channels 1-4)
- EQ Mid: CC12, 32, 52, 72 (channels 1-4)
- EQ Mid Frequency: CC13, 33, 53, 73 (channels 1-4)
- EQ Low: CC14, 34, 54, 74 (channels 1-4)
- Aux1: CC15, 35, 55, 75 (channels 1-4)
- Aux2: CC16, 36, 56, 76 (channels 1-4)
- EFX Send: CC17, 37, 57, 77 (channels 1-4)
- Mute: CC18, 38, 58, 78 (channels 1-4)
- Mono (Ch 3-4): CC19, 39 (channels 3-4)

### Global Controls
- EFX Type: CC117 (Radio selection: Hall=1, Room=26, Spring=51, Delay=80, Echo=105)
- Compressor: CC119 (Toggle: On/Off)

### Sound Pads (MIDI Notes)
- Pad 1: Note 60 (C3)
- Pad 2: Note 62 (D3)
- Pad 3: Note 64 (E3)
- Pad 4: Note 65 (F3)

## Development

Built with:
- Vue.js 3 with TypeScript
- WebMIDI.js for MIDI communication
- Vite for build tooling

### Project Setup
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

## Usage Tips

### LFO System
- **Enable LFOs**: Click the small LFO button on any knob in regular view mode
- **LFO Controls**: Adjust rate (speed), depth (amount), shape (waveform), and mode (direction)
- **Visual Feedback**: Active LFOs show animated indicators on controls
- **Global Control**: Use "Disable LFOs" buttons to quickly turn off all LFOs

### Compact Mode
- **Mobile Optimization**: Automatically shows labels inside buttons and knobs
- **Space Efficient**: All controls in a single row for better mobile experience
- **Touch Friendly**: Optimized button sizes for touch interaction

### Sound Pads
- **MIDI Triggers**: Send MIDI note on/off messages to your Zoom L6
- **Touch Support**: Works with both mouse and touch input
- **Programmable**: MIDI notes can be customized in the configuration

### Debug Console
- **Troubleshooting**: Access via the Debug button in the header
- **MIDI Monitoring**: View real-time MIDI communication logs
- **Error Tracking**: Monitor system errors and warnings

![Zoom L6 Companion App](/images/debugger.png)

## Customization


> [!NOTE]
> We'll be adding configuration options for MIDI CC, channel, and pad notes to the UI in the future. Right now it uses the default Zoom L6 MIDI CC mappings.

### Adjusting MIDI CC Values
If your Zoom L6 uses different MIDI mappings, you can modify the configuration in:
`src/config/midiConfig.ts`

### UI Customization
The app uses CSS custom properties for theming. Key color values can be found in:
`src/App.vue` (global styles section)

### Sound Pad Configuration
Modify Sound Pad MIDI notes and channels in:
`src/config/midiConfig.ts` (soundPads array)

## Troubleshooting

### MIDI Connection Issues
1. Ensure WebMIDI is supported in your browser
2. Check USB cable connection
3. Verify Zoom L6 is powered on and in MIDI mode
4. Try refreshing the device list and select the correct device (this varies by OS)
5. Check debug console and browser console for error messages

## Browser & OS Compatibility

| Browser | Windows | macOS | Linux | Android | iOS | Notes |
|---------|---------|-------|-------|---------|-----|-------|
| Chrome | ✅ | ✅ | ✅ | 🚧 | ❌ | Recommended browser |
| Microsoft Edge | ✅ | ✅ | ✅ | 🚧 | ❌ | Full WebMIDI support |
| Firefox | ✅ | ✅ | ✅ | 🚧 | ❌ | Requires WebMIDI enabled |
| Safari | ❌ | ✅ | ❌ | ❌ | ❌ | Plugin required |

See https://webmidijs.org/docs/getting-started/ and https://caniuse.com/midi for more information.


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for more information.
