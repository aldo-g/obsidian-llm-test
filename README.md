# LLM Testing Plugin

Test your knowledge with AI-generated questions based on your Obsidian notes. This plugin helps you study more effectively by creating contextually relevant questions from your notes and providing instant feedback on your answers, using various Large Language Models.

## Features

- **AI-Generated Questions**: Automatically create test questions based on your notes using multiple LLM providers:
  - OpenAI (GPT-3.5, GPT-4, GPT-4o)
  - Anthropic Claude (Claude 3 Opus, Sonnet, Haiku, Claude 3.5 Sonnet)
  - Mistral AI (Tiny, Small, Medium, Large)
  - Google Gemini (Pro, 1.5 Pro, 1.5 Flash)
  - DeepSeek (Chat, Coder)
- **Knowledge Assessment**: Test your understanding with customized questions at different difficulty levels
- **Instant Feedback**: Get immediate feedback on your answers
- **Score Tracking**: Track your progress with detailed scoring
- **Organized Dashboard**: View and manage all your tests in one place

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to "Community Plugins" and disable Safe Mode
3. Click "Browse" and search for "Test Plugin"
4. Install the plugin and enable it

## Setup

1. After installation, go to the plugin settings in Obsidian
2. Select your preferred LLM provider (OpenAI, Anthropic Claude, Mistral, Gemini, or DeepSeek)
3. Enter your API key for the selected provider
4. Choose your preferred model from the available options
5. Click the test flask icon in the ribbon or use the command "Open Test Dashboard"

### Getting API Keys

To use this plugin, you'll need an API key from one of the supported providers:

- **OpenAI**: Get your API key from [OpenAI Platform](https://platform.openai.com/account/api-keys)
- **Anthropic Claude**: Get your API key from [Anthropic Console](https://console.anthropic.com/settings/keys)
- **Mistral AI**: Get your API key from [Mistral Console](https://console.mistral.ai/api-keys/)
- **Google Gemini**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **DeepSeek**: Get your API key from the DeepSeek website

## Model Selection

You can choose from various models for each provider:

- **OpenAI**: GPT-3.5 Turbo, GPT-4, GPT-4 Turbo, GPT-4o
- **Anthropic Claude**: Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku, Claude 3.5 Sonnet
- **Mistral AI**: Mistral Tiny, Mistral Small, Mistral Medium, Mistral Large
- **Google Gemini**: Gemini Pro, Gemini 1.5 Pro, Gemini 1.5 Flash
- **DeepSeek**: DeepSeek Chat, DeepSeek Coder

Models with larger context windows (like GPT-4o, Claude 3 Opus, or Gemini 1.5 Pro) can handle longer notes, while smaller models may be more cost-effective for frequent testing.

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

This plugin uses Retrieval-Augmented Generation (RAG) with various LLM models to:

1. **Index and analyze** your Obsidian notes
2. **Generate contextually relevant questions** based on the content
3. **Mark your answers** by comparing them to the original note content
4. **Provide helpful feedback** to improve your understanding

## Requirements

- Obsidian v0.15.0 or higher
- An API key from one of the supported providers (OpenAI, Anthropic, Mistral, Google, or DeepSeek)

## FAQ & Troubleshooting

**Q: Why do I need an API key?**  
A: The plugin uses LLM APIs to generate questions and mark answers. You need an API key to access these services.

**Q: Will my notes be sent to the LLM provider?**  
A: Yes, the plugin sends the content of the notes you select for test generation to the API of your chosen provider. Only use this plugin with notes that you're comfortable sharing with the selected service.

**Q: I'm getting an error about context length exceeding limits.**  
A: LLM models have token limits. Try:
1. Selecting smaller notes
2. Splitting larger notes into multiple files
3. Using a model with a larger context window (like GPT-4o, Claude 3 Opus, or Gemini 1.5 Pro)

**Q: Can I customize the types of questions generated?**  
A: Currently, the plugin generates a mix of short (1-mark), long (2-mark), and extended (3-mark) questions. Future versions may include customization options.

## Privacy

This plugin sends the content of selected notes to your chosen LLM provider for processing. Please review the privacy policy of your selected provider before using this plugin:

- [OpenAI Privacy Policy](https://openai.com/privacy/)
- [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- [Mistral AI Privacy Policy](https://mistral.ai/privacy/)
- [Google AI Privacy Policy](https://ai.google/static/documents/google-ai-privacy.pdf)
- [DeepSeek Privacy Policy](https://deepseek.com/privacy)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Acknowledgements

- Built with [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- Uses LLM APIs from OpenAI, Anthropic, Mistral, Google, and DeepSeek for test generation and grading
