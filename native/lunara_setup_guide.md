# Lunara Setup Guide: Unsplash API

To enable immersive, high-quality images for intimacy insights and libido tracking in Lunara, you need to set up an Unsplash API key.

## Steps

1.  **Create an Unsplash Developer Account**:
    Go to [Unsplash Developers](https://unsplash.com/developers) and sign up.

2.  **Create a New Application**:
    - Click on "Your Apps" and then "New Application".
    - Accept the terms and give your app a name (e.g., "Orbit Lunara").

3.  **Get your Access Key**:
    Once the app is created, you will see an "Access Key" under the "Keys" section.

4.  **Add to Environment Variables**:
    In your project's root `.env` file (or wherever you manage secret keys for Expo), add the following line:
    ```env
    EXPO_PUBLIC_UNSPLASH_ACCESS_KEY=your_access_key_here
    ```

5.  **Restart the Development Server**:
    If the app is running, restart it to pick up the new environment variable.

## Technical Details

- **Optimization**: Images are fetched based on keywords related to the current cycle phase and intimacy suggestions.
- **Caching**: Images are cached locally using `AsyncStorage` and are tied to the specific suggestion and date, ensuring they remain fixed for the day and reducing API calls.
- **Redmi 10 Optimization**: The `expo-image` component is used for efficient rendering and transition effects, minimizing performance impact on lower-end devices.
