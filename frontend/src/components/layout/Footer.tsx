export function Footer() {
  return (
    <footer className="border-t border-gray-800 py-6 text-center text-sm text-gray-500">
      <p>
        PulseChain Analytics — Open-source, community-driven.{' '}
        <a
          href="https://github.com/eva-sentience/pulsechain-analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-white"
        >
          GitHub
        </a>
        {' | '}
        <a
          href="https://dune.com/evasentience/pulsechain-bridge-analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-white"
        >
          Dune Dashboard
        </a>
      </p>
      <p className="mt-1 text-gray-600">
        Not financial advice. Data provided for informational purposes only.
      </p>
    </footer>
  )
}
