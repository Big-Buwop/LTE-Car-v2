const gpio = require('pigpio').Gpio;

const $towerX =  pin(17)
const $towerY = pin(27)
const $steer = pin(22)
const $esc = pin(18)
const $honk = pin(21)

let lastCommandTime = Date.now();

async function initiate(server, config) {
    console.log("Initiating controls");
    server.on("car-control", data => {
        updateControls(data)
    })

    // Failsafe: neutralize controls if no commands for 500ms
    setInterval(() => {
        if (Date.now() - lastCommandTime > 500) {
            $esc.servoWrite(1500);
            $steer.servoWrite(1500);
        }
    }, 100);
}

function updateControls(controls) {
    lastCommandTime = Date.now();
    $towerX.servoWrite(toCycle(controls.axes["2"], 0.8))
    $towerY.servoWrite(toCycle(controls.axes["3"], 0.8, true))
    $steer.servoWrite(toCycle(controls.axes["0"], 0.4, true) + 30)

    const escVal = toESC(controls.paddles.left, controls.paddles.right, 250)
    $esc.servoWrite(escVal);

    if (controls.buttons.square == 1) {
        honk()
    }
}

function toESC(forward, backward, max) {
    const value = forward - backward
    
    return Math.round(1500 - (value * max))
}

function toCycle(val, sens, reverse) {
    if (reverse == true) {
        return Math.round(1500 + val * (1000 * sens))
    }
    else {
        return Math.round(1500 - val * (1000 * sens))
    }
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, ms);
    })
}

function pin(pin) {
    return new gpio(pin, {mode: gpio.OUTPUT})
}

async function honk() {
    $honk.pwmWrite(120)
    
    setTimeout(() => {
        $honk.pwmWrite(0)
    }, 500);
}

module.exports = {
    init: (server, config) => {
        initiate(server, config)
    }
}
