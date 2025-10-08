# Contributing to Zoom L6 Companion

Thank you for your interest in contributing to the Zoom L6 Companion project! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites
- Node.js (version 20 or higher)
- npm package manager
- A Zoom L6 mixer for testing (recommended)
- Modern web browser with WebMIDI support (Currently fully supported on MacOS Chrome)

### Development Setup
1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/zoom-l6-companion.git
   cd zoom-l6-companion
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Development Guidelines

### Code Style
- Use TypeScript for all new code
- Follow Vue.js 3 Composition API patterns
- Use meaningful variable and function names
- Add comments for complex logic
- Ensure responsive design for mobile devices

### Project Structure
```
src/
├── components/          # Vue components
│   ├── ChannelStrip.vue # Channel strip controls
│   ├── GlobalControls.vue # Global effect controls
│   ├── LFOControl.vue   # LFO configuration dialog
│   ├── MidiControl.vue  # Individual MIDI controls
│   ├── MidiConnection.vue # MIDI device connection
│   └── SoundPads.vue    # MIDI trigger pads
├── config/              # Configuration files
│   └── midiConfig.ts    # MIDI CC mappings
├── services/            # Service modules
│   └── midiService.ts   # WebMIDI integration
└── App.vue             # Main application component
```

### Testing
- Test on as many configurations as possible
- Test with actual Zoom L6 hardware
- Verify mobile responsiveness
- Test MIDI communication functionality in both directions (if possible)

## Submitting Changes

### Pull Request Process
1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following the coding guidelines
3. Test your changes thoroughly
4. Update documentation if needed
5. Commit your changes with descriptive messages:
   ```bash
   git commit -m "Add: New feature description"
   ```
6. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. Create a Pull Request on GitHub

### Pull Request Guidelines
- Provide a clear description of changes
- Include screenshots for UI changes
- Reference any related issues
- Ensure all tests pass
- Update documentation as needed

## Reporting Issues

For bug reports and feature requests, please use the GitHub issue templates:
- **Bug Reports**: Use the "Bug Report" template when creating an issue
- **Feature Requests**: Use the "Feature Request" template for new feature suggestions
- **General Questions**: Use the "General Issue" template for questions and discussions

The templates will guide you through providing all the necessary information.


## Hardware Testing

### Zoom L6 Compatibility
- Test all control types (knobs, buttons, sound pads)
- Ensure LFO functionality works with hardware

### Browser Compatibility
- Chrome (primary target)
- Microsoft Edge
- Firefox (with WebMIDI enabled)
- Test mobile browsers when possible

## Documentation

### Updating Documentation
- Keep README.md current with new features
- Update setup instructions if needed
- Add troubleshooting information for new features

## Questions?

If you have questions about contributing:
- Check existing issues and discussions
- Join discussions in existing pull requests
- Review the codebase and existing implementations

Thank you for contributing to Zoom L6 Companion!
