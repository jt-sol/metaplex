import os
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
import argparse
import time 
import tqdm 

# Create svg string of ticket pixelart 
def svg_string(number: str) -> str:
  return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 58 29" shape-rendering="crispEdges">
  <path stroke="#f2be50"
    d="M2 0h54M1 1h1M56 1h1M2 6h1M55 6h1M1 7h1M56 7h1M2 12h1M55 12h1M1 13h1M56 13h1M2 18h1M55 18h1M1 19h1M56 19h1M2 24h1M55 24h1M1 25h1M56 25h1" />
  <path stroke="#edac4a"
    d="M2 1h54M1 2h17M22 2h14M40 2h17M2 3h20M25 3h8M36 3h20M3 4h22M26 4h6M33 4h22M3 5h3M23 5h3M28 5h2M32 5h3M52 5h3M3 6h25M30 6h25M2 7h54M1 8h56M2 9h54M3 10h52M3 11h52M3 12h52M2 13h54M1 14h56M2 15h54M3 16h52M3 17h52M3 18h52M2 19h54M1 20h56M2 21h54M3 22h25M30 22h25M3 23h3M23 23h3M28 23h2M32 23h3M52 23h3M3 24h22M26 24h6M33 24h22M2 25h20M25 25h8M36 25h20M1 26h17M22 26h14M40 26h17M2 27h54" />
  <path stroke="#e79842"
    d="M0 2h1M57 2h1M1 3h1M56 3h1M2 4h1M55 4h1M0 8h1M57 8h1M1 9h1M56 9h1M2 10h1M55 10h1M0 14h1M57 14h1M1 15h1M56 15h1M2 16h1M55 16h1M0 20h1M57 20h1M1 21h1M56 21h1M2 22h1M55 22h1M0 26h1M57 26h1M1 27h1M56 27h1M2 28h54" />
  <path stroke="#ce7c32"
    d="M18 2h4M36 2h4M22 3h3M33 3h3M25 4h1M32 4h1M6 5h17M26 5h2M30 5h2M35 5h17M28 6h2M28 22h2M6 23h17M26 23h2M30 23h2M35 23h17M25 24h1M32 24h1M22 25h3M33 25h3M18 26h4M36 26h4" />
  <text
    style="font-family: basis33;text-anchor: middle;text-align: center;fill: #000000; font-size: 16px;"
    x="29" y="17.5">{number}</text>
</svg>"""

# Add leading zeros to number with less than 6 digits
def parse_number(number: int) -> str:
  length = len(str(number))
  if(length < 6):
    return "0"*(6-length%6) + str(number)
  return str(number)


if __name__ == '__main__':

  parser = argparse.ArgumentParser()
  parser.add_argument(
      '--destination', '-d', type=str,
      help="destination for images",
      required = 1
  )

  parser.add_argument(
  '--number', '-n', type=int,
  help="number of images",
  default=10,
  )

  args = parser.parse_args()

  # Generate files
  start = time.time()

  for i in tqdm.tqdm(range(args.number)):
    number = parse_number(i)

    # Save the file as svg
    file = open(os.path.join(args.destination, f"{number}.svg"), "w")
    file.write(svg_string(number))
    file.close()

    # Save the file as png
    svg = svg2rlg(os.path.join(args.destination, f"{number}.svg"))
    renderPM.drawToFile(
      svg, 
      os.path.join(args.destination, f"{i}.png"), 
      fmt="PNG", 
      bg=0xffffff, 
      configPIL={"transparency": [255,255,255]}
    )

    os.remove(os.path.join(args.destination, f"{number}.svg"))

    # print(f"Created files {number}.svg, {number}.png")
  print(time.time() - start)
   
