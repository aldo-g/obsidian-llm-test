# Obsidian Test Plugin

Test your knowledge with AI-generated questions based on your Obsidian notes. This plugin helps you study more effectively by creating contextually relevant questions from your notes and providing instant feedback on your answers.

## Features

- **AI-Generated Questions**: Automatically create test questions based on your notes using OpenAI
- **Knowledge Assessment**: Test your understanding with customized questions at different difficulty levels
- **Instant Feedback**: Get immediate feedback on your answers
- **Score Tracking**: Track your progress with detailed scoring
- **Bulk Testing**: Mark multiple tests simultaneously to save time
- **Organized Dashboard**: View and manage all your tests in one place

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to "Community Plugins" and disable Safe Mode
3. Click "Browse" and search for "Test Plugin"
4. Install the plugin and enable it

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/aldo-g/obsidian-rag-test-plugin/releases)
2. Extract the files into your Obsidian vault's `.obsidian/plugins/obsidian-rag-test-plugin` folder
3. Restart Obsidian and enable the plugin in the Community Plugins settings

## Setup

1. After installation, go to the plugin settings in Obsidian
2. Enter your OpenAI API key (required for generating and marking tests)
3. Click the test flask icon in the ribbon or use the command "Open Test Dashboard"

## Usage

### Creating Tests

1. Open the Test Dashboard from the ribbon or command palette
2. Click "Refresh" to scan your vault for notes
3. Select the notes you want to create tests for by checking the boxes
4. Click "Create Tests" to generate questions based on the selected notes


### Taking Tests

1. From the Test Dashboard, click on any test with a "Start" badge
2. Answer the questions in the test document
3. Click "Mark" to receive feedback and scoring
4. Review your results and improve your understanding

### Bulk Marking

The plugin allows you to mark multiple tests at once:

1. Complete answers in multiple test documents
2. Return to the Test Dashboard
3. Click "Mark All Tests" button at the bottom right
4. All tests with answers will be graded simultaneously

## How It Works

This plugin uses Retrieval-Augmented Generation (RAG) with OpenAI's GPT models to:

1. **Index and analyze** your Obsidian notes
2. **Generate contextually relevant questions** based on the content
3. **Mark your answers** by comparing them to the original note content
4. **Provide helpful feedback** to improve your understanding

## Requirements

- Obsidian v0.15.0 or higher
- An OpenAI API key

## FAQ & Troubleshooting

**Q: Why do I need an OpenAI API key?**  
A: The plugin uses OpenAI's API to generate questions and mark answers. You can get an API key from [OpenAI's website](https://platform.openai.com/).

**Q: Will my notes be sent to OpenAI?**  
A: Yes, the plugin sends the content of the notes you select for test generation to OpenAI's API. Only use this plugin with notes that you're comfortable sharing with OpenAI.

**Q: I'm getting an error about context length exceeding limits.**  
A: OpenAI's models have token limits. Try selecting smaller notes or splitting larger notes into multiple files.

**Q: Can I customize the types of questions generated?**  
A: Currently, the plugin generates a mix of short, long, and extended questions. Future versions may include customization options.

## Privacy

This plugin sends the content of selected notes to OpenAI for processing. Please review [OpenAI's privacy policy](https://openai.com/privacy/) before using this plugin.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the Zero-Clause BSD License (0BSD):

## Acknowledgements

- Built with [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- Uses [OpenAI API](https://openai.com/api/) for test generation and grading
