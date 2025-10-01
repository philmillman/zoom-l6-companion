# Zoom L6 Companion App

A web-based companion application for the Zoom L6 mixer built with Vue.js and WebMIDI.js. This app allows you to control your Zoom L6 mixer directly from your browser using MIDI over USB.

## Features

- **6 Channel Strips** - Full control over each of the 6 channels including:
  - Gain control
  - 3-band EQ (High, Mid, Low)
  - Pan control
  - Aux sends (Aux1, Aux2)
  - Volume fader
  - Mute and Solo buttons

- **Global Controls** - Master section and effects:
  - Master volume and aux controls
  - Reverb send, return, and type
  - Delay send, return, time, and feedback
  - Compressor threshold, ratio, attack, and release

- **MIDI Integration** - WebMIDI.js powered features:
  - Auto-detection of Zoom L6 device
  - Real-time bidirectional MIDI communication
  - Support for manual device selection
  - MIDI CC mapping based on Zoom L6 specification

- **Modern UI** - Responsive design features:
  - Dark theme optimized for studio environments
  - Compact and Advanced view modes
  - Touch-friendly controls for tablets
  - Responsive layout for all screen sizes

## Requirements

- Modern web browser with WebMIDI support (Chrome, Edge, Firefox)
- Zoom L6 mixer connected via USB
- MIDI drivers installed (usually automatic)

## Setup Instructions

1. **Connect your Zoom L6**:
   - Connect the Zoom L6 to your computer via USB cable
   - Ensure the device is powered on
   - Verify MIDI drivers are installed (should be automatic)

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
   - Changes are sent to the Zoom L6 in real-time

## MIDI CC Mapping

The app uses the following MIDI CC mappings (typical values - may need adjustment based on your device firmware):

### Channel Controls (per channel)
- Gain: CC1, 21, 41, 61, 81, 101 (channels 1-6)
- Volume: CC7, 27, 47, 67, 87, 107 (channels 1-6)  
- Pan: CC10, 30, 50, 70, 90, 110 (channels 1-6)
- EQ High: CC11, 31, 51, 71, 91, 111 (channels 1-6)
- EQ Mid: CC12, 32, 52, 72, 92, 112 (channels 1-6)
- EQ Low: CC13, 33, 53, 73, 93, 113 (channels 1-6)
- Aux1: CC14, 34, 54, 74, 94, 114 (channels 1-6)
- Aux2: CC15, 35, 55, 75, 95, 115 (channels 1-6)
- Mute: CC16, 36, 56, 76, 96, 116 (channels 1-6)
- Solo: CC17, 37, 57, 77, 97, 117 (channels 1-6)

### Global Controls
- Master Volume: CC8
- Reverb Send: CC2
- Reverb Return: CC3
- Reverb Type: CC4
- Delay Send: CC5
- Delay Return: CC6
- Delay Time: CC20
- Delay Feedback: CC9
- Compressor Threshold: CC118
- Compressor Ratio: CC119
- Compressor Attack: CC120
- Compressor Release: CC121

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

## Customization

### Adjusting MIDI CC Values
If your Zoom L6 uses different MIDI CC mappings, you can modify the configuration in:
`src/config/midiConfig.ts`

### UI Customization
The app uses CSS custom properties for theming. Key color values can be found in:
`src/App.vue` (global styles section)

## Troubleshooting

### MIDI Connection Issues
1. Ensure WebMIDI is supported in your browser
2. Check USB cable connection
3. Verify Zoom L6 is powered on and in MIDI mode
4. Try refreshing the device list
5. Check browser console for error messages

### Performance Issues
1. Use Chrome or Edge for best WebMIDI performance
2. Close other browser tabs using audio/MIDI
3. Enable "Compact Mode" for better mobile performance

## Browser Compatibility

- ✅ Chrome (recommended)
- ✅ Microsoft Edge  
- ✅ Firefox (with WebMIDI enabled)
- ❌ Safari (WebMIDI not supported)

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Contributing

Issues and pull requests welcome! Please ensure any MIDI CC changes are well documented and tested with actual hardware.
