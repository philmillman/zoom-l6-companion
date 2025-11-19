# Zoom L6 Companion App

**This project is not affiliated with Zoom Corp.**

> This is under active development, contributions are welcome!

***You can try it out here: https://zooml6.webmidi.cc in a WebMIDI supported browser***


![full channel view](/images/channel-full.png)

A web-based companion application for the Zoom L6 mixer built with Vue.js and WebMIDI.js. This app allows you to control your Zoom L6 mixer directly from your browser using MIDI over USB. 

**Now supports the Zoom L6Max!**
- Autodetects and automatically adds the additional channels, scenes, send, and AI Noise Reduction controls
- Can manually select in Advanced Settings and override any MIDI mappings

## Features

![compact channel view](/images/channel-compact.png)

- **6 Channel Strips** - Full control over each of the 6 channels including:
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
  - Global/per-channel/per-control LFO pause/resume

- **Sound Pads** - MIDI trigger pads:
  - 4 programmable MIDI note triggers
  - MIDI note on/off messages
  - Customizable MIDI notes and channels

- **Advanced Settings** - Complete MIDI configuration:
  - Customize all MIDI CC mappings for channel controls
  - Configure global control CC assignments
  - Set MIDI notes for Sound Pads
  - Global MIDI channel setting
  - Duplicate CC/note detection with warnings
  - Reset to factory defaults
  - Persistent settings saved to browser storage

- **MIDI Integration** - WebMIDI.js powered features:
  - Auto-detection of Zoom L6 device
  - Real-time bidirectional MIDI communication
  - Support for manual device selection
  - Fully customizable MIDI CC mapping via Advanced Settings UI

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
   - Customize MIDI mappings via the Advanced Settings (optional)
   - Changes are sent to the Zoom L6 in real-time

## MIDI CC Mapping

> [!TIP]
> These default MIDI CC mappings can now be customized directly in the app via **Advanced Settings**!

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

### Advanced Settings
- **Access**: Click the "Advanced" button in the header to open MIDI configuration
- **Customize MIDI Mappings**: Change any CC assignment for channel or global controls
- **Configure Sound Pads**: Set custom MIDI notes for each pad
- **MIDI Channel**: Set the global MIDI channel for all controls (default: 1)
- **Duplicate Detection**: The system warns you about duplicate CC or note assignments
- **Reset**: Return to factory default MIDI mappings at any time
- **Persistence**: Your custom settings are automatically saved to localStorage

> [!TIP]
> Custom MIDI must be set in the official Zoom L6 editor first. Then you can update the MIDI settings in the app.

### LFO System
- **Enable LFOs**: Click the small LFO button on any knob in regular view mode
- **LFO Controls**: Adjust rate (speed), depth (amount), shape (waveform), and mode (direction)
- **Visual Feedback**: Active LFOs show animated indicators on controls
- **Global Control**: Use "Pause/Resume LFOs" button to control all LFOs at once
- **Double-click**: Double-click any control to reset it to default value

### Compact Mode
- **Mobile Optimization**: Automatically shows labels inside buttons and knobs
- **Space Efficient**: All controls in a single row for better mobile experience
- **Touch Friendly**: Optimized button sizes for touch interaction

### Sound Pads
- **MIDI Triggers**: Send MIDI note on/off messages to your Zoom L6
- **Touch Support**: Works with both mouse and touch input
- **Customizable**: Configure MIDI notes and channels in Advanced Settings

### Debug Console
- **Troubleshooting**: Access via the Debug button in the header
- **MIDI Monitoring**: View real-time MIDI communication logs
- **Error Tracking**: Monitor system errors and warnings

![Zoom L6 Companion App](/images/debugger.png)

## Troubleshooting

### MIDI Connection Issues
1. Ensure WebMIDI is supported in your browser
2. Check USB cable connection
3. Verify Zoom L6 is powered on and in MIDI mode
4. Try refreshing the device list and select the correct device (this varies by OS)
5. Check debug console and browser console for error messages

### MIDI Not Responding to Controls
1. Verify the correct MIDI input/output devices are selected
2. Check if your Zoom L6 uses different MIDI CC mappings - use **Advanced Settings** to customize
3. Ensure the MIDI channel matches your device (default is Channel 1)
4. Check for duplicate CC assignments in Advanced Settings
5. Try resetting to default settings in Advanced Settings

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
