/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ide: {
          background: '#1E1F26',
          secondary: '#222632',
          editor: '#2B2D3A',
          button: {
            primary: {
              DEFAULT: '#22C55E',
              hover: '#16A34A',
            },
          },
          border: {
            DEFAULT: '#374151',
          },
          text: {
            primary: '#FFFFFF',
            secondary: '#9CA3AF',
            editor: '#E5E7EB',
          }
        },
      },
      container: {
        center: true,
        screens: {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1280px',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

