#!/bin/bash

# List of all locale directories
locales=(
  "ca"
  "de"
  "en"
  "es"
  "fr"
  "hi"
  "it"
  "ja"
  "ko"
  "pl"
  "pt-BR"
  "ru"
  "tr"
  "vi"
  "zh-CN"
  "zh-TW"
)

# Process each locale
for locale in "${locales[@]}"; do
  # Path to the kodely.json file
  kodely_file="src/i18n/locales/${locale}/kodely.json"
  kodely_file="src/i18n/locales/${locale}/kodely.json"
  
  # Read the content of the kodely.json file
  content=$(cat "$kodely_file")
  
  # Replace "Kodely" with "Kodely"
  updated_content=$(echo "$content" | sed 's/Kodely/Kodely/g')
  
  # Replace "Kodely" with "Kodely"
  updated_content=$(echo "$updated_content" | sed 's/Kodely/Kodely/g')
  
  # Create the new kodely.json file
  echo "$updated_content" > "$kodely_file"
  
  echo "Created $kodely_file"
done

echo "All src locale files updated!"
