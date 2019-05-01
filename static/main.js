const baseURL = `${location.protocol}//${location.host}/`
const loginURL = baseURL + "login/"
const directoryURL = baseURL + "directory/"
const volInterval = 3600 * 1000

const loginForm = document.getElementById("loginForm")
loginForm.hidden = true

const username = document.getElementById("username")
const password = document.getElementById("password")

const main = document.getElementById("main")
main.hidden = true

const status = document.getElementById("status")
const volunteers = document.getElementById("volunteers")

function loadJSON(url, func, onerror) {
    let req = new XMLHttpRequest()
    req.open("GET", url)
    req.onload = () => func(JSON.parse(req.response))
    req.onerror = onerror
    req.send()
}

function startVolunteersTask() {
    main.hidden = false
    setInterval(loadVolunteers, volInterval)
    loadVolunteers()
}

window.onload = () => {
    loadJSON(baseURL + "authenticated", (data) => {
        if (data) {
            startVolunteersTask()
        } else {
            loginForm.hidden = false
            status.innerText = "Awaiting login..."
        }
    }, () => status.innerText = "Could not ascertain authentication state.")
}

function loadVolunteers() {
    status.innerText = "Loading volunteer list..."
    loadJSON(directoryURL, (data) => {
        data = data.volunteers
        status.innerText = `Volunteers last loaded ${new Date()}.`
        for (let i = 0; i < volunteers.rows.length; i++) {
            volunteers.deleteRow(i)
        }
        let cellCounter = 0
        let row = null
        for (let volunteer of data.sort((a, b) => a.id - b.id)) {
            cellCounter += 1
            if (row === null) {
                row = document.createElement("tr")
                volunteers.appendChild(row)
            }
            let cell = document.createElement("td")
            cell.id = volunteer.id
            cell.classList.push("volunteer")
            row.appendChild(cell)
            cell.innerHTML = `${volunteer.name}<br><a href="https://www.3r.org.uk/directory/${volunteer.id}" target="_new"><img src="${baseURL}thumb/${volunteer.id}" alt="View in directory"></a>`
            if (cellCounter == 12) {
                row = null
                cellCounter = 0
            }
        }
    }, () => status.innerText = "Could not get volunteer list.")
}

loginForm.onsubmit = (e) => {
    e.preventDefault()
    if (!username.value || !password.value) {
        alert("You must enter a valid 3 rings username and password.")
        username.focus()
    } else {
        let fd = new FormData()
        fd.append("username", username.value)
        fd.append("password", password.value)
        let req = new XMLHttpRequest()
        req.onerror = () => {
            alert("Setting username and password failed.")
            username.focus()
        }
        req.onload = () => {
            username.value = ""
            password.value = ""
            loginForm.hidden = true
            startVolunteersTask()
        }
        req.open("POST", loginURL)
        req.send(fd)
    }
}
